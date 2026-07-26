import { getOrder, updateOrder } from "../_shared/orders.js";
import { requireGithubUser } from "../_shared/auth.js";
import { sendEmail } from "../_shared/email.js";
import { readyClient } from "../_shared/templates.js";
import { restituerCommande } from "../_shared/stock.js";
import { ok, bad, parseJson } from "../_shared/http.js";

const VALID = new Set(["pending", "paid", "preparing", "ready", "completed", "cancelled"]);

export async function onRequestPost({ request, env }) {
  const auth = await requireGithubUser(request, env);
  if (auth.error) return bad(auth.error.message, auth.error.status);

  const body = await parseJson(request);
  if (!body) return bad("Corps invalide");

  const { orderId, status, note } = body;
  if (!orderId) return bad("orderId requis");
  if (!VALID.has(status)) return bad("Statut invalide : " + status);

  try {
    const before = await getOrder(env.ORDERS_KV, orderId);
    if (!before) return bad("Commande introuvable", 404);

    const updated = await updateOrder(env.ORDERS_KV, orderId, (o) => { o.status = status; }, {
      actor: auth.user.login || auth.user.email,
      note: note || `Changement par ${auth.user.login}`,
    });

    // ── Annulation : le stock retourne en vente ──
    // restituerCommande traite aussi les commandes déjà payées, dont la
    // réservation est « consommée » — le cas du remboursement. Idempotente :
    // repasser deux fois en « Annulée » ne crédite pas deux fois.
    if (status === "cancelled" && before.status !== "cancelled") {
      try {
        const n = await restituerCommande(env.STOCKS_DB, orderId, auth.user.login || "admin");
        if (n) console.log(`[update-order-status] ${n} ligne(s) de stock rendue(s) — ${orderId}`);
      } catch (e) { console.error("[update-order-status] Relâche stock KO :", e.message); }
    }

    if (status === "ready" && before.status !== "ready") {
      try {
        const tpl = readyClient(updated);
        await sendEmail(env, { to: updated.client.email, ...tpl });
      } catch (e) { console.error("[update-order-status] Email 'ready' KO :", e.message); }
    }
    return ok({ order: updated });
  } catch (err) {
    return bad("Erreur : " + err.message, 500);
  }
}
