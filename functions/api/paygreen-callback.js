/**
 * functions/api/paygreen-callback.js
 * Retour navigateur après paiement PayGreen (hosted payment page).
 *
 * PayGreen redirige vers :
 *   return_url?status=success&orderId=xxx   → paiement réussi (ou initié)
 *   cancel_url?status=cancel&orderId=xxx    → client a annulé
 *
 * ATTENTION : ce callback navigateur n'est pas la source de vérité — le webhook l'est.
 * Ici on vérifie le statut via l'API PayGreen avant de marquer la commande payée.
 */

import { getOrder, updateOrder } from "../_shared/orders.js";
import { getPaymentOrder, isOrderPaid } from "../_shared/paygreen.js";
import { sendEmail, merchantEmail } from "../_shared/email.js";
import { paiementClient, paiementMerchant } from "../_shared/templates.js";
import { redirect } from "../_shared/http.js";

export async function onRequestGet({ request, env }) {
  const url      = new URL(request.url);
  const status   = url.searchParams.get("status");
  const orderId  = url.searchParams.get("orderId");
  const siteUrl  = env.SITE_URL || "https://maisoncbdvape.pages.dev";

  // Annulation explicite par le client
  if (status === "cancel" || !orderId) {
    if (orderId) {
      try {
        await updateOrder(env.ORDERS_KV, orderId, (o) => { o.status = "cancelled"; }, {
          actor: "paygreen-callback",
          note:  "Client a annulé le paiement",
        });
      } catch {}
    }
    return redirect(siteUrl + "/commande/paiement-echec/?id=" + encodeURIComponent(orderId || ""));
  }

  // Récupérer la commande en KV
  let existingOrder;
  try { existingOrder = await getOrder(env.ORDERS_KV, orderId); } catch {}
  if (!existingOrder) {
    console.warn("[paygreen-callback] Commande introuvable :", orderId);
    return redirect(siteUrl + "/commande/paiement-echec/?id=" + encodeURIComponent(orderId));
  }

  const paygreenOrderId = existingOrder.paiement?.paygreenOrderId;
  if (!paygreenOrderId) {
    console.warn("[paygreen-callback] paygreenOrderId manquant pour :", orderId);
    return redirect(siteUrl + "/commande/paiement-echec/?id=" + encodeURIComponent(orderId));
  }

  // Vérifier le statut via l'API PayGreen (ne pas faire confiance au seul redirect)
  let paymentOrder;
  try {
    paymentOrder = await getPaymentOrder(env, paygreenOrderId);
  } catch (err) {
    console.error("[paygreen-callback] getPaymentOrder KO :", err.message);
    return redirect(siteUrl + "/commande/paiement-echec/?id=" + encodeURIComponent(orderId));
  }

  if (!isOrderPaid(paymentOrder)) {
    const pgStatus = paymentOrder?.status || "unknown";
    console.warn("[paygreen-callback] Paiement non autorisé :", pgStatus);
    try {
      await updateOrder(env.ORDERS_KV, orderId, (o) => { o.status = "cancelled"; }, {
        actor: "paygreen-callback",
        note:  "Statut PayGreen : " + pgStatus,
      });
    } catch {}
    return redirect(siteUrl + "/commande/paiement-echec/?id=" + encodeURIComponent(orderId));
  }

  // Si déjà marqué payé (webhook arrivé avant), on redirige directement
  if (existingOrder.status === "paid") {
    return redirect(siteUrl + "/commande/confirmation/?id=" + encodeURIComponent(orderId) + "&paid=1");
  }

  // Marquer la commande payée
  let order;
  try {
    order = await updateOrder(env.ORDERS_KV, orderId, (o) => {
      o.status                        = "paid";
      o.paiement.paygreenOrderId      = paygreenOrderId;
      o.paiement.paidAt               = new Date().toISOString();
    }, { actor: "paygreen-callback", note: "Paiement validé via callback" });
  } catch {
    return redirect(siteUrl + "/commande/paiement-echec/?id=" + encodeURIComponent(orderId));
  }

  // Emails de confirmation
  try {
    const tpl = paiementClient(order);
    await sendEmail(env, { to: order.client.email, ...tpl });
  } catch (e) { console.error("[paygreen-callback] Email client KO :", e.message); }

  const merchant = merchantEmail(env);
  if (merchant) {
    try {
      const tpl = paiementMerchant(order, siteUrl);
      await sendEmail(env, { to: merchant, ...tpl });
    } catch (e) { console.error("[paygreen-callback] Email marchand KO :", e.message); }
  }

  return redirect(siteUrl + "/commande/confirmation/?id=" + encodeURIComponent(orderId) + "&paid=1");
}
