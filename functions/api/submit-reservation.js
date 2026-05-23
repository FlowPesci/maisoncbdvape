/**
 * functions/api/submit-reservation.js
 * POST => enregistre une commande (Click & Collect ou Livraison), envoie 2 emails.
 */
import { createOrder } from "../_shared/orders.js";
import { sendEmail, merchantEmail } from "../_shared/email.js";
import { reservationClient, reservationMerchant } from "../_shared/templates.js";
import { ok, bad, parseJson } from "../_shared/http.js";
import { lookupPrice } from "../_shared/catalog-index.js";
import { rateLimit, getClientIp } from "../_shared/ratelimit.js";

export async function onRequestPost({ request, env }) {
  const ip = getClientIp(request);
  if (await rateLimit(env.ORDERS_KV, "reservation", ip, { max: 10, windowSecs: 3600 })) {
    return bad("Trop de tentatives. Reessayez dans une heure.", 429);
  }

  const body = await parseJson(request);
  if (!body) return bad("Corps de requete invalide");

  const { client, items, modeLivraison, creneauRetrait, adresseLivraison } = body;
  const mode = modeLivraison || "click-and-collect";

  if (!client?.nom || client.nom.trim().length < 2) return bad("Nom invalide");
  if (!client?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)) return bad("Email invalide");
  if (!client?.telephone || !/^[0-9 +.\-()]{8,}$/.test(client.telephone)) return bad("Telephone invalide");
  if (!Array.isArray(items) || items.length === 0) return bad("Panier vide");

  const VALID_HOURS = new Set(["07:30","08:00","09:00","09:30","10:30","11:00","14:00","15:30","17:00"]);

  if (mode === "click-and-collect") {
    if (!creneauRetrait?.date || !creneauRetrait?.heure) return bad("Creneau de retrait manquant");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(creneauRetrait.date)) return bad("Format de date invalide");
    const retrait = new Date(creneauRetrait.date + "T00:00:00");
    if (isNaN(retrait.getTime())) return bad("Date invalide");
    const today = new Date(); today.setHours(0,0,0,0);
    if (retrait <= today) return bad("La date de retrait doit etre dans le futur");
    const maxDate = new Date(today.getTime() + 30 * 24 * 3600 * 1000);
    if (retrait > maxDate) return bad("Date de retrait trop lointaine (max 30 jours)");
    if (!/^\d{2}:\d{2}$/.test(creneauRetrait.heure)) return bad("Format d'heure invalide");
    if (!VALID_HOURS.has(creneauRetrait.heure)) return bad("Creneau horaire non valide");
  } else {
    if (!adresseLivraison?.adresse || !adresseLivraison?.codePostal || !adresseLivraison?.ville)
      return bad("Adresse de livraison incomplete");
    if (!/^\d{5}$/.test(adresseLivraison.codePostal)) return bad("Code postal invalide (5 chiffres)");
    if (adresseLivraison.adresse.length > 200) return bad("Adresse trop longue");
    if (adresseLivraison.ville.length > 100) return bad("Ville trop longue");
  }

  const trustedItems = [];
  for (const it of items) {
    if (!it.id || !it.nom)
      return bad("Article invalide : " + (it?.id || "?"));
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 99)
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

  // Frais de port : 3,90 EUR si sous-total < 30 EUR, sinon gratuit (livraison uniquement)
  const FRAIS_PORT = 3.90;
  const SEUIL_GRATUIT = 30;
  const sousTotal = trustedItems.reduce((sum, it) => sum + it.prix * it.qty, 0);
  const trustedFraisPort = mode === "livraison" && sousTotal < SEUIL_GRATUIT ? FRAIS_PORT : 0;

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
      modeLivraison: mode,
      creneauRetrait: mode === "click-and-collect" ? creneauRetrait : null,
      adresseLivraison: mode === "livraison" ? {
        adresse: adresseLivraison.adresse.trim(),
        codePostal: adresseLivraison.codePostal.trim(),
        ville: adresseLivraison.ville.trim(),
      } : null,
      paiement: { methode: "en-magasin", vivaTransactionId: null, vivaOrderCode: null, paidAt: null },
      status: "pending",
    });
  } catch (err) {
    return bad("Erreur creation commande : " + err.message, 500);
  }

  const siteUrl = env.SITE_URL || "https://vapelab.fr";

  const replyTo = env.EMAIL_REPLY_TO || "contact@vapelab.fr";

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
