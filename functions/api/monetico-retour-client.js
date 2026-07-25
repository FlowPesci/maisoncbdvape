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
  const siteUrl = env.SITE_URL || "https://maisoncbdvape.pages.dev";

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
  if (orderId) {
    try {
      const order = await getOrder(env.ORDERS_KV, orderId);
      paid = order?.status === "paid";
    } catch (err) { console.error("[monetico-retour-client] getOrder KO :", err.message); }
  }

  return redirect(
    siteUrl + "/commande/confirmation/?id=" + encodeURIComponent(orderId) + (paid ? "&paid=1" : "")
  );
}

export const onRequestGet  = handle;
export const onRequestPost = handle;
