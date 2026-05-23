import { getOrder, updateOrder } from "../_shared/orders.js";
import { getTransaction } from "../_shared/viva.js";
import { sendEmail, merchantEmail } from "../_shared/email.js";
import { paiementClient, paiementMerchant } from "../_shared/templates.js";
import { redirect } from "../_shared/http.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const status        = url.searchParams.get("status");
  const orderId       = url.searchParams.get("orderId");
  const transactionId = url.searchParams.get("t");
  const siteUrl = env.SITE_URL || "https://tabacgex.pages.dev";

  if (status === "fail" || !transactionId) {
    if (orderId) {
      try { await updateOrder(env.ORDERS_KV, orderId, (o) => { o.status = "cancelled"; }, { actor: "viva-callback", note: "Paiement echoue" }); } catch {}
    }
    return redirect(siteUrl + "/commande/paiement-echec/?id=" + encodeURIComponent(orderId || ""));
  }

  let tx;
  try { tx = await getTransaction(env, transactionId); }
  catch (err) {
    console.error("[viva-callback] getTransaction KO :", err);
    return redirect(siteUrl + "/commande/paiement-echec/?id=" + encodeURIComponent(orderId || ""));
  }

  const isPaid = tx?.statusId === "F" || tx?.statusId === "A";
  if (!isPaid) {
    if (orderId) {
      try { await updateOrder(env.ORDERS_KV, orderId, (o) => { o.status = "cancelled"; }, { actor: "viva-callback", note: "Statut transaction : " + tx?.statusId }); } catch {}
    }
    return redirect(siteUrl + "/commande/paiement-echec/?id=" + encodeURIComponent(orderId || ""));
  }

  // Securite IDOR : verifier que la transaction Viva appartient bien a cette commande.
  let existingOrder;
  try { existingOrder = await getOrder(env.ORDERS_KV, orderId); } catch {}
  if (!existingOrder) {
    console.warn("[viva-callback] Commande introuvable :", orderId);
    return redirect(siteUrl + "/commande/paiement-echec/?id=" + encodeURIComponent(orderId || ""));
  }
  const storedCode = String(existingOrder.paiement?.vivaOrderCode ?? "");
  const txCode     = String(tx?.orderCode ?? tx?.OrderCode ?? "");
  if (!storedCode || !txCode || storedCode !== txCode) {
    console.warn("[viva-callback] Mismatch orderCode — IDOR attempt ?", { storedCode, txCode, orderId, transactionId });
    return redirect(siteUrl + "/commande/paiement-echec/?id=" + encodeURIComponent(orderId || ""));
  }

  let order;
  try {
    order = await updateOrder(env.ORDERS_KV, orderId, (o) => {
      o.status = "paid";
      o.paiement.vivaTransactionId = transactionId;
      o.paiement.paidAt = new Date().toISOString();
    }, { actor: "viva-callback", note: "Paiement valide" });
  } catch {
    return redirect(siteUrl + "/commande/paiement-echec/?id=" + encodeURIComponent(orderId || ""));
  }

  try {
    const tpl = paiementClient(order);
    await sendEmail(env, { to: order.client.email, ...tpl });
  } catch (e) { console.error("[viva-callback] Email client KO :", e.message); }

  const merchant = merchantEmail(env);
  if (merchant) {
    try {
      const tpl = paiementMerchant(order, siteUrl);
      await sendEmail(env, { to: merchant, ...tpl });
    } catch (e) { console.error("[viva-callback] Email commercant KO :", e.message); }
  }

  return redirect(siteUrl + "/commande/confirmation/?id=" + encodeURIComponent(orderId) + "&paid=1");
}
