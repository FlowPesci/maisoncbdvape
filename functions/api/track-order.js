import { getOrder, MOTIF_COMMANDE } from "../_shared/orders.js";
import { ok, bad, parseJson } from "../_shared/http.js";
import { rateLimit, getClientIp } from "../_shared/ratelimit.js";

export async function onRequestPost({ request, env }) {
  const ip = getClientIp(request);
  if (await rateLimit(env.ORDERS_KV, "track", ip, { max: 20, windowSecs: 3600 })) {
    return bad("Trop de tentatives. Reessayez dans une heure.", 429);
  }

  const body = await parseJson(request);
  if (!body) return bad("Corps invalide");

  const orderId = (body.orderId || "").trim();
  const email   = (body.email   || "").trim().toLowerCase();
  if (!orderId || !email) return bad("orderId et email requis");
  // Le motif vit dans orders.js : un client peut légitimement présenter un
  // ancien numéro « TG- », émis avant la bascule vers « MCV- ».
  if (!MOTIF_COMMANDE.test(orderId)) return bad("Numero invalide", 404);

  const order = await getOrder(env.ORDERS_KV, orderId);
  if (!order || order.client.email !== email) {
    return bad("Commande introuvable ou email non reconnu", 404);
  }

  const publicView = {
    orderId: order.orderId,
    status: order.status,
    createdAt: order.createdAt,
    modeLivraison: order.modeLivraison || "click-and-collect",
    creneauRetrait: order.creneauRetrait || null,
    adresseLivraison: order.adresseLivraison || null,
    pointRetrait: order.pointRetrait || null,
    items: order.items.map((it) => ({
      nom: it.nom,
      marque: it.marque,
      qty: it.qty,
      prix: it.prix,
      varianteLabel: it.varianteLabel || null,
    })),
    totalTTC: order.totalTTC,
    fraisPort: order.fraisPort || 0,
    paiement: {
      methode: order.paiement?.methode || "en-magasin",
      paidAt: order.paiement?.paidAt || null,
    },
  };

  return ok({ order: publicView });
}
