import { createOrder, updateOrder } from "../_shared/orders.js";
import { createPaymentOrder } from "../_shared/paygreen.js";
import { ok, bad, parseJson } from "../_shared/http.js";
import { lookupPrice } from "../_shared/catalog-index.js";

export async function onRequestPost({ request, env }) {
  const body = await parseJson(request);
  if (!body) return bad("Corps invalide");

  const { client, items, creneauRetrait } = body;
  if (!client?.email || !Array.isArray(items) || !items.length) return bad("Données invalides");

  // Validation des articles + résolution des prix depuis le catalogue serveur
  const trustedItems = [];
  for (const it of items) {
    if (!it.id || !it.nom)
      return bad("Article invalide : " + (it?.id || "?"));
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 99)
      return bad("Quantité invalide pour " + it.id);

    const varianteLabel = it.varianteLabel || null;
    const trustedPrix = lookupPrice(it.id, varianteLabel);
    if (trustedPrix === null)
      return bad("Article inconnu ou prix introuvable : " + it.id + (varianteLabel ? ` (${varianteLabel})` : ""));

    trustedItems.push({
      id: it.id,
      nom: it.nom,
      marque: it.marque || "",
      prix: trustedPrix,
      qty: Number(it.qty),
      image: it.image || "",
      varianteLabel: varianteLabel || undefined,
    });
  }

  // Frais de port : 3,90 EUR si sous-total < 30 EUR, sinon gratuit (livraison uniquement)
  const FRAIS_PORT = 3.90;
  const SEUIL_GRATUIT = 30;
  const sousTotal = trustedItems.reduce((sum, it) => sum + it.prix * it.qty, 0);
  const trustedFraisPort = sousTotal < SEUIL_GRATUIT ? FRAIS_PORT : 0;

  let order;
  try {
    order = await createOrder(env.ORDERS_KV, {
      client: {
        nom: client.nom.trim(),
        email: client.email.trim().toLowerCase(),
        telephone: client.telephone.trim(),
        notes: (client.notes || "").trim(),
      },
      items: trustedItems,
      fraisPort: trustedFraisPort,
      creneauRetrait,
      paiement: { methode: "paygreen", paygreenOrderId: null, paidAt: null },
      status: "pending",
    });
  } catch (err) {
    return bad("Erreur creation commande : " + err.message, 500);
  }

  const siteUrl = env.SITE_URL || "https://tabacgex.pages.dev";
  const amountCents = Math.round(order.totalTTC * 100);

  // Découper le nom complet en prénom / nom pour PayGreen
  const nameParts    = (order.client.nom || "").trim().split(/\s+/);
  const firstName    = nameParts[0] || "Client";
  const lastName     = nameParts.slice(1).join(" ") || "-";

  let checkout;
  try {
    checkout = await createPaymentOrder(env, {
      amountCents,
      reference:   order.orderId,
      description: "Commande " + order.orderId,
      buyer: {
        email:     order.client.email,
        firstName,
        lastName,
      },
      returnUrl: siteUrl + "/api/paygreen-callback?status=success&orderId=" + encodeURIComponent(order.orderId),
      cancelUrl: siteUrl + "/api/paygreen-callback?status=cancel&orderId=" + encodeURIComponent(order.orderId),
    });
  } catch (err) {
    try {
      await updateOrder(env.ORDERS_KV, order.orderId, (o) => { o.status = "cancelled"; }, {
        actor: "create-payment",
        note:  "PayGreen createPaymentOrder KO : " + err.message,
      });
    } catch {}
    return bad("Erreur création paiement PayGreen : " + err.message, 502);
  }

  // Stocker le paygreenOrderId — nécessaire pour la vérification dans paygreen-callback.js
  try {
    await updateOrder(env.ORDERS_KV, order.orderId, (o) => {
      o.paiement.paygreenOrderId = checkout.paymentOrderId;
    }, { actor: "create-payment", note: "paygreenOrderId enregistré" });
  } catch (err) {
    console.error("[create-payment] Mise à jour paygreenOrderId KO :", err.message);
  }

  return ok({ checkoutUrl: checkout.hostedPaymentUrl, orderId: order.orderId });
}
