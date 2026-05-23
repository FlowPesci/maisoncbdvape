import { getOrder } from "../_shared/orders.js";
import { requireGithubUser } from "../_shared/auth.js";
import { ok, bad } from "../_shared/http.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireGithubUser(request, env);
  if (auth.error) return bad(auth.error.message, auth.error.status);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return bad("Paramètre id requis");

  const order = await getOrder(env.ORDERS_KV, id);
  if (!order) return bad("Commande introuvable", 404);
  return ok({ order });
}
