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
import { reserverPanier, relacherReservation } from "../_shared/stock.js";
import { computeFraisPort } from "../_shared/livraison.js";
import { valideLivraison } from "../_shared/valide-livraison.js";
import { valideClient } from "../_shared/valide-client.js";
import { rateLimit, getClientIp } from "../_shared/ratelimit.js";

export async function onRequestPost({ request, env }) {
  // ── Limite de débit ──
  // C'est le SEUL endpoint public qui réserve du stock : sans plafond,
  // quelques centaines d'appels immobilisent tout le catalogue pendant la
  // durée de réservation, sans qu'aucune vente n'ait lieu. Les autres
  // endpoints publics (contact, newsletter, réservation, suivi) sont déjà
  // protégés — celui-ci avait été oublié.
  const ip = getClientIp(request);
  if (await rateLimit(env.ORDERS_KV, "paiement", ip, { max: 10, windowSecs: 600 })) {
    return bad("Trop de tentatives de commande. Réessayez dans quelques minutes.", 429);
  }

  const body = await parseJson(request);
  if (!body) return bad("Corps invalide");

  const { client, items } = body;
  if (!Array.isArray(items) || !items.length) return bad("Panier vide");

  // Mêmes règles que submit-reservation : les deux chemins créent une commande.
  const cli = valideClient(client);
  if (cli.erreur) return bad(cli.erreur);

  // ── Mode de livraison et informations associées, validés côté serveur ──
  const liv = valideLivraison(body);
  if (liv.erreur) return bad(liv.erreur);

  // ── Validation des articles + résolution des prix depuis le catalogue serveur ──
  const trustedItems = [];
  for (const it of items) {
    if (!it.id || !it.nom)
      return bad("Article invalide : " + (it?.id || "?"));
    if (!Number.isInteger(it.qty) || it.qty < 1)
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
  const sousTotal = trustedItems.reduce((sum, it) => sum + it.prix * it.qty, 0);
  const trustedFraisPort = computeFraisPort(sousTotal, liv.mode);

  let order;
  try {
    order = await createOrder(env.ORDERS_KV, {
      client: cli.client,
      items:            trustedItems,
      fraisPort:        trustedFraisPort,
      modeLivraison:    liv.mode,
      creneauRetrait:   liv.creneauRetrait,
      adresseLivraison: liv.adresseLivraison,
      pointRetrait:     liv.pointRetrait,
      paiement: { methode: "monetico", moneticoRef: null, paidAt: null },
      status:   "pending",
    });
  } catch (err) {
    return bad("Erreur création commande : " + err.message, 500);
  }

  // ── Réservation du stock ──
  // Après la création de la commande, pour disposer de son identifiant, mais
  // AVANT d'envoyer le client chez Monetico : il ne doit jamais payer un
  // article qui vient d'être vendu à quelqu'un d'autre.
  const resa = await reserverPanier(env.STOCKS_DB, order.orderId, trustedItems);
  if (!resa.ok) {
    try {
      await updateOrder(env.ORDERS_KV, order.orderId, (o) => { o.status = "cancelled"; }, {
        actor: "create-payment", note: "Stock indisponible : " + resa.erreur,
      });
    } catch {}
    return bad(resa.erreur, 409);
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
    // Le stock a déjà été réservé : sans cette relâche il resterait bloqué
    // jusqu'à expiration alors que la commande n'ira jamais au paiement.
    try { await relacherReservation(env.STOCKS_DB, order.orderId, "relache"); } catch {}
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
