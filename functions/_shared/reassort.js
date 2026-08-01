/**
 * functions/_shared/reassort.js
 * Prévenir le commerçant qu'une référence est à recommander.
 *
 * ─── Pourquoi ce fichier existe séparément ────────────────────────────────
 * Il aurait été plus court d'envoyer l'e-mail depuis `stock.js`. Ç'aurait
 * aussi rendu la réservation de stock — donc la prise de commande —
 * dépendante d'un service de messagerie tiers. Une panne de Resend n'a pas
 * à empêcher une vente.
 *
 * `stock.js` calcule donc qui franchit son seuil et ne fait rien d'autre.
 * Ce module fait le reste, et il est appelé de façon à ne jamais pouvoir
 * faire échouer la commande.
 * ─────────────────────────────────────────────────────────────────────────── */

import { alertesAEmettre } from "./stock.js";
import { sendEmail, merchantEmail } from "./email.js";
import { reassortMerchant } from "./templates.js";

/**
 * Signale les références qui viennent de passer sous leur seuil.
 *
 * ⚠ Ne lève jamais. Appelée après une commande déjà enregistrée : à ce
 * stade, tout ce qui échoue doit être journalisé, pas remonté au client.
 * Le client n'a rien à voir avec un problème de réassort.
 *
 * @param {string[]} cles  Références touchées par la commande
 * @returns {Promise<number>} Nombre de références signalées
 */
export async function signalerReassort(env, cles) {
  try {
    if (!env.STOCKS_DB || !cles?.length) return 0;

    const lignes = await alertesAEmettre(env.STOCKS_DB, cles);
    if (!lignes.length) return 0;

    const destinataire = env.EMAIL_ALERTE_STOCK || merchantEmail(env);
    if (!destinataire) {
      // Le franchissement est quand même marqué en base : le tableau de bord
      // le montrera. Mieux vaut une alerte silencieuse qu'une alerte répétée.
      console.warn("[reassort] Aucun destinataire configuré —",
        lignes.length, "référence(s) sous seuil :", lignes.map((l) => l.cle).join(", "));
      return 0;
    }

    const tpl = reassortMerchant(lignes, env.SITE_URL || "https://maisoncbdvape.fr");
    await sendEmail(env, { to: destinataire, ...tpl });
    return lignes.length;
  } catch (e) {
    console.error("[reassort] Alerte non envoyée :", e.message);
    return 0;
  }
}
