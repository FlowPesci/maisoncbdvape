import { getOrder, updateOrder } from "../_shared/orders.js";
import { requireGithubUser } from "../_shared/auth.js";
import { sendEmail } from "../_shared/email.js";
import { readyClient } from "../_shared/templates.js";
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
