import { listOrders, updateOrder } from "../_shared/orders.js";
import { getTransaction, webhookKey } from "../_shared/viva.js";
import { ok, bad } from "../_shared/http.js";

// GET = handshake : Viva attend { Key: "<la cle>" }
export async function onRequestGet({ env }) {
  const key = webhookKey(env);
  if (!key) return bad("VIVA_WEBHOOK_KEY non configuree", 500);
  return ok({ Key: key });
}

// POST = events
export async function onRequestPost({ request, env }) {
  const webhookSecret = webhookKey(env);
  if (!webhookSecret) return bad("VIVA_WEBHOOK_KEY non configuree", 500);

  const authHeader = request.headers.get("Authorization") || "";
  const providedKey = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  if (providedKey !== webhookSecret) {
    console.warn("[viva-webhook] Cle webhook invalide — requete rejetee");
    return bad("Non autorise", 401);
  }

  let payload;
  try { payload = await request.json(); }
  catch { return bad("JSON invalide"); }

  const eventTypeId  = payload?.EventTypeId;
  const data         = payload?.EventData || {};
  const transactionId = data.TransactionId;
  const orderCode    = data.OrderCode;
  console.log("[viva-webhook] Event :", { eventTypeId, transactionId, orderCode });

  if (eventTypeId !== 1796 || !transactionId || !orderCode) return ok({ ignored: true });

  const orders = await listOrders(env.ORDERS_KV);
  const found = orders.find((o) => String(o.paiement?.vivaOrderCode) === String(orderCode));
  if (!found) return ok({ ignored: true, reason: "orderCode inconnu" });

  // Verifier la transaction aupres de Viva avant de marquer payee
  let tx;
  try { tx = await getTransaction(env, transactionId); }
  catch (err) {
    console.error("[viva-webhook] getTransaction KO :", err.message);
    return bad("Verification transaction echouee", 502);
  }

  const isPaid = tx?.statusId === "F" || tx?.statusId === "A";
  if (!isPaid) return ok({ ignored: true, reason: "transaction non finalisee : " + tx?.statusId });

  try {
    await updateOrder(env.ORDERS_KV, found.orderId, (o) => {
      o.status = "paid";
      o.paiement.vivaTransactionId = transactionId;
      o.paiement.paidAt = new Date().toISOString();
    }, { actor: "viva-webhook", note: "Paiement confirme par webhook" });
  } catch (err) {
    console.error("[viva-webhook] updateOrder KO :", err.message);
    return bad("Mise a jour commande echouee", 500);
  }

  return ok({ updated: found.orderId });
}
