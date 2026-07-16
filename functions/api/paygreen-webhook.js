/**
 * functions/api/paygreen-webhook.js
 * Webhook PayGreen (Listener) — confirmation asynchrone des paiements.
 *
 * PayGreen envoie un POST avec :
 *   header "signature" = base64(HMAC-SHA256(rawBody, hmacKey))
 *   body JSON : { id, event_type, subject_id, data: { ... } }
 *
 * On écoute l'event "payment_order.authorized" pour valider la commande.
 * C'est la source de vérité : même si le client ferme son navigateur avant
 * la redirection, la commande sera bien marquée payée ici.
 *
 * Configuration : dans le dashboard PayGreen, créer un Listener
 *   URL    : https://maisoncbdvape.fr/api/paygreen-webhook
 *   Events : payment_order.authorized
 *   → copier le "hmac-key" généré dans PAYGREEN_HMAC_KEY (wrangler.toml)
 */

import { listOrders, updateOrder } from "../_shared/orders.js";
import { verifyWebhookSignature } from "../_shared/paygreen.js";
import { sendEmail, merchantEmail } from "../_shared/email.js";
import { paiementClient, paiementMerchant } from "../_shared/templates.js";
import { ok, bad } from "../_shared/http.js";

export async function onRequestPost({ request, env }) {
  const hmacKey = env.PAYGREEN_HMAC_KEY;
  if (!hmacKey) {
    console.error("[paygreen-webhook] PAYGREEN_HMAC_KEY non configurée");
    return bad("PAYGREEN_HMAC_KEY manquante", 500);
  }

  // Lire le corps brut (nécessaire pour vérifier la signature)
  const rawBody = await request.text();

  // Vérifier la signature HMAC
  const signature = request.headers.get("signature") || "";
  const isValid = await verifyWebhookSignature(rawBody, signature, hmacKey);
  if (!isValid) {
    console.warn("[paygreen-webhook] Signature invalide — requête rejetée");
    return bad("Signature invalide", 401);
  }

  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { return bad("JSON invalide"); }

  const eventType = payload?.event_type;
  const subjectId = payload?.subject_id; // ID du Payment Order (po_...)
  console.log("[paygreen-webhook] Event :", { eventType, subjectId });

  // On ne traite que les paiements autorisés
  if (eventType !== "payment_order.authorized" || !subjectId) {
    return ok({ ignored: true, reason: "event non géré : " + eventType });
  }

  // Retrouver la commande correspondant à ce Payment Order
  const orders = await listOrders(env.ORDERS_KV);
  const found  = orders.find((o) => o.paiement?.paygreenOrderId === subjectId);
  if (!found) {
    console.warn("[paygreen-webhook] Aucune commande trouvée pour paygreenOrderId :", subjectId);
    return ok({ ignored: true, reason: "paygreenOrderId inconnu" });
  }

  // Déjà payée ? Idempotence — on répond 200 sans ré-écrire
  if (found.status === "paid") {
    return ok({ ignored: true, reason: "commande déjà payée" });
  }

  // Marquer la commande payée
  const siteUrl = env.SITE_URL || "https://maisoncbdvape.pages.dev";
  let order;
  try {
    order = await updateOrder(env.ORDERS_KV, found.orderId, (o) => {
      o.status           = "paid";
      o.paiement.paidAt  = new Date().toISOString();
    }, { actor: "paygreen-webhook", note: "Paiement confirmé par webhook" });
  } catch (err) {
    console.error("[paygreen-webhook] updateOrder KO :", err.message);
    return bad("Mise à jour commande échouée", 500);
  }

  // Emails (seulement si le callback navigateur ne les a pas déjà envoyés)
  // On tente quand même — sendEmail est idempotent côté Resend (pas de double envoi problématique)
  try {
    const tpl = paiementClient(order);
    await sendEmail(env, { to: order.client.email, ...tpl });
  } catch (e) { console.error("[paygreen-webhook] Email client KO :", e.message); }

  const merchant = merchantEmail(env);
  if (merchant) {
    try {
      const tpl = paiementMerchant(order, siteUrl);
      await sendEmail(env, { to: merchant, ...tpl });
    } catch (e) { console.error("[paygreen-webhook] Email marchand KO :", e.message); }
  }

  return ok({ updated: found.orderId });
}
