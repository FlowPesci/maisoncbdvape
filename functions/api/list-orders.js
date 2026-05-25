import { listOrders } from "../_shared/orders.js";
import { requireGithubUser } from "../_shared/auth.js";
import { ok, bad } from "../_shared/http.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireGithubUser(request, env);
  if (auth.error) return bad(auth.error.message, auth.error.status);

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  try {
    const orders = await listOrders(env.ORDERS_KV, { status });
    return ok({ orders });
  } catch (err) {
    return bad("Erreur récupération : " + err.message, 500);
  }
}
