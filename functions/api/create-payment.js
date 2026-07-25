/**
 * functions/api/create-payment.js
 * Crée la commande en KV puis retourne le formulaire scellé Monetico Paiement.
 *
 * Monetico fonctionne par POST de formulaire depuis le navigateur du client
 * (et non par redirection vers une URL d'API). On renvoie donc au front les
 * champs à poster ; le JS construit un formulaire caché et le soumet.
 */

import { createOrder, updateOrder } from "../_shared/orders.js";
import {
  buildPaymentForm, moneticoMontant, moneticoReference,
} from "../_shared/monetico.js";
import { ok, bad, parseJson } from "../_shared/http.js";
import { lookupPrice } from "../_shared/catalog-index.js";

// Frais de port : 3,90 EUR si sous-total < 30 EUR, sinon gratuit (livraison uniquement)
const FRAIS_PORT    = 3.90;
const SEUIL_GRATUIT = 30;

export async function onRequestPost({ request, env }) {
  const body = await parseJson(request);
  if (!body) return bad("Corps invalide");

  const { client, items, creneauRetrait, modeLivraison, adresseLivraison } = body;
  if (!client?.email || !Array.isArray(items) || !items.length) return bad("Données invalides");

  // ── Validation des articles + résolution des prix depuis le catalogue serveur ──
  const trustedItems = [];
  for (const it of items) {
    if (!it.id || !it.nom)
      return bad("Article invalide : " + (it?.id || "?"));
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 99)
      return bad("Quantité invalide pour " + it.id);

    const varianteLabel = it.varianteLabel || null;
    const trustedPrix   = lookupPrice(it.id, varianteLabel);
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

  // ── Frais de port recalculés côté serveur (jamais depuis le client) ──
  const modeLiv    = modeLivraison === "livraison" ? "livraison" : "click-and-collect";
  const sousTotal  = trustedItems.reduce((sum, it) => sum + it.prix * it.qty, 0);
  const trustedFraisPort =
    modeLiv === "livraison" && sousTotal < SEUIL_GRATUIT ? FRAIS_PORT : 0;

  let order;
  try {
    order = await createOrder(env.ORDERS_KV, {
      client: {
        nom:       client.nom.trim(),
        email:     client.email.trim().toLowerCase(),
        telephone: client.telephone.trim(),
        notes:     (client.notes || "").trim(),
      },
      items:         trustedItems,
      fraisPort:     trustedFraisPort,
      modeLivraison: modeLiv,
      creneauRetrait:   modeLiv === "click-and-collect" ? creneauRetrait : null,
      adresseLivraison: modeLiv === "livraison" ? adresseLivraison : null,
      paiement: { methode: "monetico", moneticoRef: null, paidAt: null },
      status:   "pending",
    });
  } catch (err) {
    return bad("Erreur création commande : " + err.message, 500);
  }

  const siteUrl = env.SITE_URL || "https://maisoncbdvape.pages.dev";

  // Montant réellement débité = articles + frais de port
  const montant   = moneticoMontant(order.totalAPayer);
  const reference = moneticoReference(order.orderId);

  // Index inverse référence Monetico → orderId, lu par l'interface « Retour ».
  // La notification serveur ne renvoie que la référence, pas notre orderId.
  try {
    await env.ORDERS_KV.put("mtc:" + reference, order.orderId, { expirationTtl: 60 * 60 * 24 * 30 });
  } catch (err) {
    console.error("[create-payment] Index mtc: KO :", err.message);
    return bad("Erreur d'initialisation du paiement", 500);
  }

  let form;
  try {
    form = await buildPaymentForm(env, {
      montant,
      reference,
      mail:        order.client.email,
      texteLibre:  order.orderId,
      urlRetourOk:  siteUrl + "/api/monetico-retour-client?statut=ok&ref="  + encodeURIComponent(reference),
      urlRetourErr: siteUrl + "/api/monetico-retour-client?statut=err&ref=" + encodeURIComponent(reference),
    });
  } catch (err) {
    try {
      await updateOrder(env.ORDERS_KV, order.orderId, (o) => { o.status = "cancelled"; }, {
        actor: "create-payment",
        note:  "Formulaire Monetico non généré : " + err.message,
      });
    } catch {}
    return bad("Erreur création paiement : " + err.message, 502);
  }

  try {
    await updateOrder(env.ORDERS_KV, order.orderId, (o) => {
      o.paiement.moneticoRef = reference;
    }, { actor: "create-payment", note: "Référence Monetico " + reference });
  } catch (err) {
    console.error("[create-payment] Enregistrement moneticoRef KO :", err.message);
  }

  return ok({
    orderId:    order.orderId,
    paymentUrl: form.url,
    fields:     form.fields,
  });
}
