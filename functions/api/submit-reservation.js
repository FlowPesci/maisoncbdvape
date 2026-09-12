/**
 * functions/api/submit-reservation.js
 * POST => enregistre une commande sans paiement en ligne, envoie 2 emails.
 * Tous modes de livraison : retrait boutique, domicile, point retrait, consigne.
 */
import { createOrder, updateOrder } from "../_shared/orders.js";
import { sendEmail, merchantEmail } from "../_shared/email.js";
import { reservationClient, reservationMerchant } from "../_shared/templates.js";
import { ok, bad, parseJson } from "../_shared/http.js";
import { lookupPrice } from "../_shared/catalog-index.js";
import { reserverPanier, consommerReservation } from "../_shared/stock.js";
import { signalerReassort } from "../_shared/reassort.js";
import { computeFraisPort, besoinCreneau } from "../_shared/livraison.js";
import { valideLivraison } from "../_shared/valide-livraison.js";
import { valideClient } from "../_shared/valide-client.js";
import { rateLimit, getClientIp } from "../_shared/ratelimit.js";

export async function onRequestPost({ request, env }) {
  const ip = getClientIp(request);
  if (await rateLimit(env.ORDERS_KV, "reservation", ip, { max: 10, windowSecs: 3600 })) {
    return bad("Trop de tentatives. Reessayez dans une heure.", 429);
  }

  const body = await parseJson(request);
  if (!body) return bad("Corps de requete invalide");

  const { client, items } = body;

  // Règles communes aux deux chemins de commande — voir _shared/valide-client.js
  const cli = valideClient(client);
  if (cli.erreur) return bad(cli.erreur);
  if (!Array.isArray(items) || items.length === 0) return bad("Panier vide");

  // Mode de livraison et informations associées — mêmes règles que create-payment.js
  const liv = valideLivraison(body);
  if (liv.erreur) return bad(liv.erreur);

  // ⚠ Ce chemin est celui du règlement en boutique. Il n'a de sens que si le
  // client vient chercher sa commande : on ne peut pas encaisser au comptoir
  // quelqu'un qui se fait livrer chez lui. Le bouton est masqué côté client
  // dès qu'un autre mode est choisi, mais c'est ici que la règle est tenue —
  // masquer un bouton n'empêche personne d'appeler l'API directement.
  if (!besoinCreneau(liv.mode)) {
    return bad(
      "Le règlement en boutique n'est possible qu'avec le retrait sur place. " +
      "Choisissez le retrait, ou réglez votre commande en ligne."
    );
  }

  const trustedItems = [];
  for (const it of items) {
    if (!it.id || !it.nom)
      return bad("Article invalide : " + (it?.id || "?"));
    if (!Number.isInteger(it.qty) || it.qty < 1)
      return bad("Quantite invalide pour " + it.id);
    // Accepte les deux formats : id composite "produit--variante" OU id + varianteLabel separes
    const rawId = it.id;
    const baseId = rawId.includes("--") ? rawId.split("--")[0] : rawId;
    const varianteLabel = it.varianteLabel || (rawId.includes("--") ? rawId.split("--")[1] : null);
    const trustedPrix = lookupPrice(baseId, varianteLabel);
    if (trustedPrix === null)
      return bad("Article inconnu ou prix introuvable : " + baseId + (varianteLabel ? " (" + varianteLabel + ")" : ""));

    trustedItems.push({
      id: baseId,
      nom: it.nom,
      marque: it.marque || "",
      prix: trustedPrix,
      qty: Number(it.qty),
      image: it.image || "",
      varianteLabel: varianteLabel || undefined,
    });
  }

  // Frais de port recalculés côté serveur (jamais depuis le client)
  const sousTotal = trustedItems.reduce((sum, it) => sum + it.prix * it.qty, 0);
  const trustedFraisPort = computeFraisPort(sousTotal, liv.mode);

  let order;
  try {
    order = await createOrder(env.ORDERS_KV, {
      client: cli.client,
      items: trustedItems,
      fraisPort: trustedFraisPort,
      modeLivraison:    liv.mode,
      creneauRetrait:   liv.creneauRetrait,
      adresseLivraison: liv.adresseLivraison,
      pointRetrait:     liv.pointRetrait,
      paiement: { methode: "en-magasin", moneticoRef: null, paidAt: null },
      status: "pending",
    });
  } catch (err) {
    return bad("Erreur creation commande : " + err.message, 500);
  }

  // ── Stock ──
  // Aucun paiement en ligne ici : la commande est ferme dès sa création, on
  // réserve puis on consomme dans la foulée plutôt que de laisser une
  // réservation expirer au bout de 30 minutes.
  const resa = await reserverPanier(env.STOCKS_DB, order.orderId, trustedItems);
  if (!resa.ok) return bad(resa.erreur, 409);
  try { await consommerReservation(env.STOCKS_DB, order.orderId); } catch (e) {
    console.error("[submit-reservation] Consommation stock KO :", e.message);
  }

  const siteUrl = env.SITE_URL || "https://maisoncbdvape.fr";

  const replyTo = env.EMAIL_REPLY_TO || "contact@maisoncbdvape.fr";

  // ⚠ L'issue de chaque envoi est écrite SUR la commande, pas seulement dans
  // la console du Worker.
  //
  // Un échec d'e-mail ne doit jamais faire échouer une commande déjà payée ou
  // réservée — d'où les `catch` qui absorbent. Mais absorber sans trace rend
  // la panne invisible : le 2026-09-12, aucun e-mail n'était parti depuis la
  // mise en service et rien, nulle part, ne le disait. Le commerçant l'a
  // découvert en ne recevant rien.
  //
  // `sendEmail` renvoie `{ stubbed: true }` quand RESEND_API_KEY manque : ce
  // cas-là ne lève même pas d'exception, et c'est précisément celui qui s'est
  // produit. Il est donc distingué des vraies erreurs.
  const suivi = {};

  try {
    const tpl = reservationClient(order, siteUrl);
    const r = await sendEmail(env, { to: order.client.email, replyTo, ...tpl });
    suivi.client = r?.stubbed ? "non-configure" : "envoye";
  } catch (e) {
    suivi.client = "echec : " + e.message;
    console.error("[submit-reservation] Email client KO :", e.message);
  }

  const merchant = merchantEmail(env);
  if (!merchant) {
    suivi.commercant = "aucun-destinataire";
  } else {
    try {
      const tpl = reservationMerchant(order, siteUrl);
      const r = await sendEmail(env, { to: merchant, replyTo, ...tpl });
      suivi.commercant = r?.stubbed ? "non-configure" : "envoye";
    } catch (e) {
      suivi.commercant = "echec : " + e.message;
      console.error("[submit-reservation] Email commercant KO :", e.message);
    }
  }

  try {
    await updateOrder(env.ORDERS_KV, order.orderId, (o) => { o.emails = suivi; },
      { actor: "submit-reservation", note: "Suivi des e-mails : " + JSON.stringify(suivi) });
  } catch (e) {
    console.error("[submit-reservation] Ecriture du suivi e-mail KO :", e.message);
  }

  // Après les e-mails de commande, jamais avant : une alerte de réassort ne
  // doit pas retarder la confirmation que le client attend.
  await signalerReassort(env, resa.cles);

  return ok({ orderId: order.orderId });
}
