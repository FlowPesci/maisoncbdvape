/**
 * functions/api/monetico-retour-client.js
 * Retour navigateur après paiement Monetico (url_retour_ok / url_retour_err).
 *
 * ⚠ Ce retour n'est PAS la source de vérité : il est déclenché par le
 *   navigateur du client et ne doit jamais marquer une commande payée.
 *   La validation se fait dans monetico-notification.js (sceau vérifié).
 *
 * Rôle : rediriger le client vers la bonne page de confirmation ou d'échec.
 * Monetico peut appeler ces URLs en GET comme en POST.
 */

import { getOrder } from "../_shared/orders.js";
import { redirect } from "../_shared/http.js";

async function handle({ request, env }) {
  const url     = new URL(request.url);
  const statut  = url.searchParams.get("statut");
  const ref     = url.searchParams.get("ref");
  const siteUrl = env.SITE_URL || "https://maisoncbdvape.fr";

  // Retrouver l'orderId depuis la référence Monetico
  let orderId = "";
  if (ref) {
    try { orderId = (await env.ORDERS_KV.get("mtc:" + ref)) || ""; }
    catch (err) { console.error("[monetico-retour-client] Lecture index KO :", err.message); }
  }

  if (statut !== "ok") {
    return redirect(siteUrl + "/commande/paiement-echec/?id=" + encodeURIComponent(orderId));
  }

  // Le client revient d'un paiement accepté. La notification serveur a
  // normalement déjà basculé la commande en « paid » — on le vérifie sans
  // bloquer : si elle n'est pas encore arrivée, la page de confirmation
  // s'affiche quand même (le statut sera à jour au prochain rafraîchissement).
  let paid = false;
  let mode = "";
  if (orderId) {
    try {
      const order = await getOrder(env.ORDERS_KV, orderId);
      paid = order?.status === "paid";
      // Le mode de livraison décide de ce que la page de confirmation raconte.
      // Sans lui, elle servait son texte de retrait en boutique à tout le
      // monde — « présentez-vous au 48 rue de Genève » pour un colis expédié.
      mode = order?.modeLivraison || "";
    } catch (err) { console.error("[monetico-retour-client] getOrder KO :", err.message); }
  }

  // `paiement=ligne` dit d'où vient le client ; `paid` dit si la notification
  // serveur est déjà arrivée. Les deux sont distincts, et c'est volontaire :
  // le retour navigateur double souvent la notification à quelques secondes
  // près. Sans cette nuance, un paiement réellement accepté s'affichait
  // « Réglez sur place » — ce que le commerçant a constaté avant nous.
  return redirect(
    siteUrl + "/commande/confirmation/?id=" + encodeURIComponent(orderId) +
    "&paiement=ligne" + (paid ? "&paid=1" : "") +
    (mode ? "&mode=" + encodeURIComponent(mode) : "")
  );
}

export const onRequestGet  = handle;
export const onRequestPost = handle;
