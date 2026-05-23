/**
 * functions/_shared/orders.js
 * Couche d'acces aux commandes via Cloudflare Workers KV.
 */

const TVA_RATE = 0.20;

export function generateOrderId() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = "" + now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) + pad(now.getHours()) + pad(now.getMinutes());
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rnd = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return "TG-" + date + "-" + rnd;
}

export function computeTotals(items) {
  const totalTTC = items.reduce((sum, it) => sum + Number(it.prix) * Number(it.qty || 1), 0);
  const totalHT  = totalTTC / (1 + TVA_RATE);
  const totalTVA = totalTTC - totalHT;
  return {
    totalHT:  Math.round(totalHT  * 100) / 100,
    totalTVA: Math.round(totalTVA * 100) / 100,
    totalTTC: Math.round(totalTTC * 100) / 100,
  };
}

export async function createOrder(kv, { client, items, fraisPort, modeLivraison, creneauRetrait, adresseLivraison, paiement, status = "pending" }) {
  const totals  = computeTotals(items);
  const orderId = generateOrderId();
  const now     = new Date().toISOString();

  const order = {
    orderId,
    createdAt: now,
    status,
    client,
    items,
    ...totals,
    fraisPort: fraisPort || 0,
    modeLivraison: modeLivraison || "click-and-collect",
    creneauRetrait: creneauRetrait || null,
    adresseLivraison: adresseLivraison || null,
    paiement: paiement || { methode: "en-magasin", vivaTransactionId: null, vivaOrderCode: null, paidAt: null },
    history: [{ at: now, status, by: "system", note: "Commande creee" }],
  };

  await kv.put(orderId, JSON.stringify(order));
  return order;
}

export async function getOrder(kv, orderId) {
  const raw = await kv.get(orderId);
  return raw ? JSON.parse(raw) : null;
}

export async function updateOrder(kv, orderId, mutator, { actor = "system", note = "" } = {}) {
  const order = await getOrder(kv, orderId);
  if (!order) throw new Error("Commande introuvable : " + orderId);

  const before  = order.status;
  const updated = mutator(order) || order;
  const after   = updated.status;

  if (before !== after) {
    updated.history = updated.history || [];
    updated.history.push({
      at: new Date().toISOString(),
      status: after,
      by: actor,
      note: note || ("Statut : " + before + " => " + after),
    });
  }

  await kv.put(orderId, JSON.stringify(updated));
  return updated;
}

export async function listOrders(kv, { status, limit = 500 } = {}) {
  // Pagination via cursor — evite la troncature silencieuse a 1000 cles
  const allKeys = [];
  let cursor = undefined;
  do {
    const result = await kv.list({ prefix: "TG-", cursor, limit: 1000 });
    for (const k of result.keys) allKeys.push(k.name);
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);

  const values  = await Promise.all(allKeys.map((k) => kv.get(k)));
  const orders  = values.filter(Boolean).map((v) => JSON.parse(v));
  const filtered = orders.filter((o) => !status || o.status === status);
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return limit ? filtered.slice(0, limit) : filtered;
}
