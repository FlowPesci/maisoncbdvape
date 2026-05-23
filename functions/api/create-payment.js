import { createOrder, updateOrder } from "../_shared/orders.js";
import { createCheckoutOrder } from "../_shared/viva.js";
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
      paiement: { methode: "viva-wallet", vivaTransactionId: null, vivaOrderCode: null, paidAt: null },
      status: "pending",
    });
  } catch (err) {
    return bad("Erreur creation commande : " + err.message, 500);
  }

  const siteUrl = env.SITE_URL || "https://tabacgex.pages.dev";
  const amountCents = Math.round(order.totalTTC * 100);

  let checkout;
  try {
    checkout = await createCheckoutOrder(env, {
      amountCents,
      merchantTrns: order.orderId,
      customerTrns: "Commande " + order.orderId,
      customer: {
        email: order.client.email,
        fullName: order.client.nom,
        phone: order.client.telephone || "",
        requestLang: "fr-FR",
      },
      successUrl: siteUrl + "/api/viva-callback?status=success&orderId=" + encodeURIComponent(order.orderId) + "&t={TransactionId}",
      failureUrl: siteUrl + "/api/viva-callback?status=fail&orderId=" + encodeURIComponent(order.orderId),
    });
  } catch (err) {
    try {
      await updateOrder(env.ORDERS_KV, order.orderId, (o) => { o.status = "cancelled"; }, {
        actor: "create-payment",
        note: "Viva createCheckoutOrder KO : " + err.message,
      });
    } catch {}
    return bad("Erreur creation paiement Viva : " + err.message, 502);
  }

  // Stocker le vivaOrderCode — necessaire pour la verification IDOR dans viva-callback.js
  try {
    await updateOrder(env.ORDERS_KV, order.orderId, (o) => {
      o.paiement.vivaOrderCode = checkout.orderCode;
    }, { actor: "create-payment", note: "vivaOrderCode enregistre" });
  } catch (err) {
    console.error("[create-payment] Mise a jour vivaOrderCode KO :", err.message);
  }

  return ok({ checkoutUrl: checkout.checkoutUrl, orderId: order.orderId });
}
