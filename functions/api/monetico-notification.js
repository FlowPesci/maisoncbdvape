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
import { verifierNotification, isPaiementAccepte, ackResponse } from "../_shared/monetico.js";
import { consommerReservation, relacherReservation } from "../_shared/stock.js";
import { signalerReassort } from "../_shared/reassort.js";
import { sendEmail, merchantEmail } from "../_shared/email.js";
import { paiementClient, paiementMerchant } from "../_shared/templates.js";

/**
 * Journal des appels reçus sur cette URL — les dix derniers, dans ORDERS_KV.
 *
 * ─── Pourquoi ─────────────────────────────────────────────────────────────
 * Quand la banque annonce « la notification de retour échoue », deux mondes
 * très différents produisent la même phrase :
 *   · elle ne nous joint pas du tout (URL non enregistrée, mauvaise adresse,
 *     filtrage) — rien n'arrive jamais ici ;
 *   · elle nous joint et nous répondons `cdr=1` — typiquement parce que
 *     MONETICO_CLE_MAC est absente ou fausse, auquel cas le sceau de CHAQUE
 *     notification est rejeté.
 * Sans trace, on ne peut pas les distinguer, et on cherche du côté du réseau
 * un problème de configuration — ou l'inverse.
 *
 * ⚠ On n'enregistre jamais les champs du paiement : ni le sceau, ni la carte
 *   masquée, ni le montant. Seulement de quoi répondre « nous a-t-elle appelés,
 *   et qu'avons-nous répondu ». L'écriture ne doit jamais empêcher l'accusé de
 *   partir : tout est absorbé.
 */
async function journaliser(env, entree) {
  try {
    if (!env.ORDERS_KV) return;
    const brut = await env.ORDERS_KV.get("mtc:journal");
    const liste = brut ? JSON.parse(brut) : [];
    liste.unshift({ at: new Date().toISOString(), ...entree });
    await env.ORDERS_KV.put("mtc:journal", JSON.stringify(liste.slice(0, 10)));
  } catch (err) {
    console.error("[monetico-notification] Journalisation KO :", err.message);
  }
}

export async function onRequestPost({ request, env }) {
  // ── 1. Lire les champs POSTés ─────────────────────────────────────────────
  // ⚠ On lit le corps BRUT, sans `request.formData()` : le décodage fait
  //   partie du sceau. Voir `lecturesDuCorps` dans _shared/monetico.js.
  let raw;
  try {
    raw = await request.text();
  } catch (err) {
    console.error("[monetico-notification] Corps illisible :", err.message);
    await journaliser(env, { methode: "POST", issue: "corps-illisible", cdr: 1 });
    return ackResponse(false);
  }

  // ── 2. Valider le sceau AVANT toute autre chose ───────────────────────────
  let macValide = false;
  let params = {};
  let variante = null;
  try {
    const v = await verifierNotification(env, raw);
    macValide = v.valide;
    params    = v.params;
    variante  = v.variante;
  } catch (err) { console.error("[monetico-notification] Vérification MAC KO :", err.message); }

  if (!macValide) {
    console.warn("[monetico-notification] Sceau invalide — notification rejetée", {
      reference: params.reference, codeRetour: params["code-retour"],
    });
    // Le diagnostic le plus fréquent derrière un sceau systématiquement
    // refusé n'est pas une attaque : c'est MONETICO_CLE_MAC absente ou
    // tronquée. `cleMacPresente` le dit sans rien révéler de la clé.
    await journaliser(env, {
      methode: "POST",
      issue: "sceau-invalide",
      cdr: 1,
      codeRetour: params["code-retour"] || null,
      cleMacPresente: !!(env.MONETICO_CLE_MAC || "").trim(),
      // Les trois lectures du corps ont toutes été essayées : si aucune ne
      // convient, le décodage n'est plus en cause. Reste la valeur de la clé
      // ou le code société.
      lecturesEssayees: 3,
    });
    return ackResponse(false);
  }

  // À partir d'ici le sceau est valide : on DOIT répondre cdr=0, quel que soit
  // le code-retour (accepté ou refusé), sinon Monetico rejouera la notification.
  const codeRetour = params["code-retour"];
  const reference  = params.reference;
  console.log("[monetico-notification] Notification scellée :", { reference, codeRetour });
  // `variante` dit quelle lecture du corps a produit le sceau attendu. Si ce
  // n'est pas « standard », c'est la preuve que le décodage par défaut était
  // la cause de l'échec — et non la clé.
  await journaliser(env, { methode: "POST", issue: "sceau-valide", cdr: 0, codeRetour, reference, variante });

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
      // Le stock réservé doit repartir en vente sans attendre l'expiration
      try { await relacherReservation(env.STOCKS_DB, orderId, "relache"); }
      catch (err) { console.error("[monetico-notification] Relâche stock KO :", err.message); }

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

  // ── 6 bis. Le stock réservé devient définitivement vendu ──
  // consommerReservation est idempotent : une notification rejouée par
  // Monetico ne décrémente pas le stock une seconde fois.
  let clesVendues = [];
  try { clesVendues = (await consommerReservation(env.STOCKS_DB, orderId)).cles; }
  catch (err) { console.error("[monetico-notification] Consommation stock KO :", err.message); }

  // Alerte de réassort ici plutôt qu'à la réservation : c'est le paiement
  // accepté qui fait la vente. Alerter plus tôt signalerait des ruptures qui
  // n'en sont pas, dès qu'un client abandonne devant le formulaire bancaire.
  await signalerReassort(env, clesVendues);

  // ── 7. Emails (ne doivent jamais faire échouer l'accusé de réception) ─────
  const siteUrl = env.SITE_URL || "https://maisoncbdvape.fr";
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

/**
 * Contrôle de joignabilité de l'URL de retour, côté banque.
 *
 * ⚠ Répondre 200 ne suffit pas : l'outil qui vérifie l'URL cherche l'accusé
 *   `version=2 / cdr=0` dans le CORPS. Jusqu'au 2026-09-18 ce handler
 *   renvoyait « Monetico notification endpoint » — un 200 parfaitement inutile
 *   pour la banque, qui ne pouvait que conclure à une notification de retour
 *   défaillante tout en constatant un code HTTP correct. C'est une panne qui
 *   se décrit naturellement comme « erreur 200 ».
 *
 * Répondre l'accusé sur un GET n'affirme rien de faux : aucune commande n'est
 * touchée ici, et Monetico ne notifie jamais un paiement autrement qu'en POST.
 */
export async function onRequestGet({ env }) {
  await journaliser(env, { methode: "GET", issue: "controle-joignabilite", cdr: 0 });
  return ackResponse(true);
}
