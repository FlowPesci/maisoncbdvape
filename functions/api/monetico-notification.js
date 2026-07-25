/**
 * functions/api/monetico-notification.js
 * Interface « Retour » Monetico Paiement — notification serveur à serveur.
 *
 * ⚠ C'est LA source de vérité du paiement. Le retour navigateur
 *   (monetico-retour-client.js) ne sert qu'à l'expérience utilisateur.
 *
 * Monetico POSTe ici en application/x-www-form-urlencoded après chaque
 * tentative de paiement. Nous disposons de 30 secondes pour répondre :
 *     version=2<LF>cdr=0<LF>   → sceau validé, notification prise en compte
 *     version=2<LF>cdr=1<LF>   → problème (Monetico réessaiera)
 *
 * Configuration : back-office Monetico → « URL de retour »
 *     https://maisoncbdvape.fr/api/monetico-notification
 */

import { getOrder, updateOrder } from "../_shared/orders.js";
import { verifyRetourMac, isPaiementAccepte, ackResponse } from "../_shared/monetico.js";
import { sendEmail, merchantEmail } from "../_shared/email.js";
import { paiementClient, paiementMerchant } from "../_shared/templates.js";

export async function onRequestPost({ request, env }) {
  // ── 1. Lire les champs POSTés ─────────────────────────────────────────────
  let params;
  try {
    const form = await request.formData();
    params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  } catch (err) {
    console.error("[monetico-notification] Corps illisible :", err.message);
    return ackResponse(false);
  }

  // ── 2. Valider le sceau AVANT toute autre chose ───────────────────────────
  let macValide = false;
  try { macValide = await verifyRetourMac(env, params); }
  catch (err) { console.error("[monetico-notification] Vérification MAC KO :", err.message); }

  if (!macValide) {
    console.warn("[monetico-notification] Sceau invalide — notification rejetée", {
      reference: params.reference, codeRetour: params["code-retour"],
    });
    return ackResponse(false);
  }

  // À partir d'ici le sceau est valide : on DOIT répondre cdr=0, quel que soit
  // le code-retour (accepté ou refusé), sinon Monetico rejouera la notification.
  const codeRetour = params["code-retour"];
  const reference  = params.reference;
  console.log("[monetico-notification] Notification scellée :", { reference, codeRetour });

  // ── 3. Retrouver la commande via l'index référence → orderId ──────────────
  let orderId = null;
  try { orderId = await env.ORDERS_KV.get("mtc:" + reference); }
  catch (err) { console.error("[monetico-notification] Lecture index KO :", err.message); }

  // Repli : le champ texte-libre contient notre orderId complet
  if (!orderId && params["texte-libre"]) orderId = params["texte-libre"];

  if (!orderId) {
    console.warn("[monetico-notification] Aucune commande pour la référence", reference);
    return ackResponse(true);
  }

  const existing = await getOrder(env.ORDERS_KV, orderId).catch(() => null);
  if (!existing) {
    console.warn("[monetico-notification] Commande introuvable :", orderId);
    return ackResponse(true);
  }

  // ── 4. Paiement refusé ou en attente ──────────────────────────────────────
  if (!isPaiementAccepte(codeRetour)) {
    if (codeRetour === "attente_partenaire") {
      console.log("[monetico-notification] Paiement en attente partenaire :", orderId);
      return ackResponse(true);
    }
    if (existing.status === "pending") {
      try {
        await updateOrder(env.ORDERS_KV, orderId, (o) => { o.status = "cancelled"; }, {
          actor: "monetico-notification",
          note:  "Paiement refusé (code-retour : " + codeRetour + ")",
        });
      } catch (err) { console.error("[monetico-notification] updateOrder KO :", err.message); }
    }
    return ackResponse(true);
  }

  // ── 5. Idempotence : la commande est peut-être déjà marquée payée ─────────
  if (existing.status === "paid") {
    return ackResponse(true);
  }

  // ── 6. Marquer payée ──────────────────────────────────────────────────────
  let order;
  try {
    order = await updateOrder(env.ORDERS_KV, orderId, (o) => {
      o.status                    = "paid";
      o.paiement.methode          = "monetico";
      o.paiement.moneticoRef      = reference;
      o.paiement.paidAt           = new Date().toISOString();
      o.paiement.numeroAutorisation = params.numauto || null;
      o.paiement.carteMasquee     = params.cbmasquee || null;
      o.paiement.modePaiement     = params.modepaiement || null;
    }, { actor: "monetico-notification", note: "Paiement validé (" + codeRetour + ")" });
  } catch (err) {
    console.error("[monetico-notification] updateOrder KO :", err.message);
    return ackResponse(false);
  }

  // ── 7. Emails (ne doivent jamais faire échouer l'accusé de réception) ─────
  const siteUrl = env.SITE_URL || "https://maisoncbdvape.pages.dev";
  try {
    await sendEmail(env, { to: order.client.email, ...paiementClient(order) });
  } catch (e) { console.error("[monetico-notification] Email client KO :", e.message); }

  const merchant = merchantEmail(env);
  if (merchant) {
    try {
      await sendEmail(env, { to: merchant, ...paiementMerchant(order, siteUrl) });
    } catch (e) { console.error("[monetico-notification] Email marchand KO :", e.message); }
  }

  return ackResponse(true);
}

// Certains contrôles de configuration Monetico appellent l'URL en GET.
export async function onRequestGet() {
  return new Response("Monetico notification endpoint", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
