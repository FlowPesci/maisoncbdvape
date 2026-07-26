/**
 * functions/api/submit-reservation.js
 * POST => enregistre une commande sans paiement en ligne, envoie 2 emails.
 * Tous modes de livraison : retrait boutique, domicile, point retrait, consigne.
 */
import { createOrder } from "../_shared/orders.js";
import { sendEmail, merchantEmail } from "../_shared/email.js";
import { reservationClient, reservationMerchant } from "../_shared/templates.js";
import { ok, bad, parseJson } from "../_shared/http.js";
import { lookupPrice } from "../_shared/catalog-index.js";
import { reserverPanier, consommerReservation } from "../_shared/stock.js";
import { computeFraisPort } from "../_shared/livraison.js";
import { valideLivraison } from "../_shared/valide-livraison.js";
import { rateLimit, getClientIp } from "../_shared/ratelimit.js";

export async function onRequestPost({ request, env }) {
  const ip = getClientIp(request);
  if (await rateLimit(env.ORDERS_KV, "reservation", ip, { max: 10, windowSecs: 3600 })) {
    return bad("Trop de tentatives. Reessayez dans une heure.", 429);
  }

  const body = await parseJson(request);
  if (!body) return bad("Corps de requete invalide");

  const { client, items } = body;

  if (!client?.nom || client.nom.trim().length < 2) return bad("Nom invalide");
  if (!client?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)) return bad("Email invalide");
  if (!client?.telephone || !/^[0-9 +.\-()]{8,}$/.test(client.telephone)) return bad("Telephone invalide");
  if (!Array.isArray(items) || items.length === 0) return bad("Panier vide");

  // Mode de livraison et informations associées — mêmes règles que create-payment.js
  const liv = valideLivraison(body);
  if (liv.erreur) return bad(liv.erreur);

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
      client: {
        nom: client.nom.trim(),
        email: client.email.trim().toLowerCase(),
        telephone: client.telephone.trim(),
        notes: (client.notes || "").trim(),
      },
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

  try {
    const tpl = reservationClient(order, siteUrl);
    await sendEmail(env, { to: order.client.email, replyTo, ...tpl });
  } catch (e) {
    console.error("[submit-reservation] Email client KO :", e.message);
  }

  const merchant = merchantEmail(env);
  if (merchant) {
    try {
      const tpl = reservationMerchant(order, siteUrl);
      await sendEmail(env, { to: merchant, replyTo, ...tpl });
    } catch (e) {
      console.error("[submit-reservation] Email commercant KO :", e.message);
    }
  }

  return ok({ orderId: order.orderId });
}
