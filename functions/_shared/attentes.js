/**
 * functions/_shared/attentes.js
 * Prévenir ceux qui attendaient un produit revenu en stock.
 *
 * Séparé de `stock.js` pour la même raison que `reassort.js` : une réception
 * de marchandise ne doit pas échouer parce qu'un service de messagerie est
 * indisponible. Le stock entre, les e-mails suivent.
 */

import { sendEmail } from "./email.js";
import { retourEnStockClient } from "./templates.js";
import { nomStock } from "./catalog-index.js";

/** Un lot d'envois à la fois : au-delà, on dépasse le temps d'un Worker. */
const MAX_PAR_PASSAGE = 40;

/**
 * Prévient les inscrits des références qui viennent d'être réapprovisionnées.
 *
 * ⚠ Ne lève jamais : appelée après une écriture de stock déjà validée.
 *
 * Chaque envoi marque sa ligne AVANT de partir. En cas de plantage au milieu
 * du lot, on préfère qu'un client ne soit pas prévenu plutôt qu'il le soit
 * deux fois — un e-mail non sollicité en double coûte plus cher en confiance
 * qu'une notification manquée, et le commerçant reste libre de relancer.
 *
 * @param {string[]} cles  Références réapprovisionnées
 * @returns {Promise<number>} Nombre de personnes prévenues
 */
export async function prevenirAttentes(env, cles) {
  try {
    const liste = [...new Set((cles || []).map(String))];
    if (!env.STOCKS_DB || !liste.length) return 0;

    const trous = liste.map((_, i) => "?" + (i + 1)).join(",");
    const { results = [] } = await env.STOCKS_DB
      .prepare(
        `SELECT a.cle, a.email FROM attentes a
           JOIN stocks s ON s.cle = a.cle
          WHERE a.cle IN (${trous}) AND a.prevenuLe IS NULL AND s.dispo > 0
          ORDER BY a.creeLe
          LIMIT ${MAX_PAR_PASSAGE}`
      )
      .bind(...liste)
      .all();

    if (!results.length) return 0;

    const siteUrl = env.SITE_URL || "https://maisoncbdvape.fr";
    let envoyes = 0;

    for (const ligne of results) {
      // L'identifiant produit est la clé amputée de sa variante : le lien
      // mène à la fiche, où le client choisira son grammage.
      const id = ligne.cle.split("::")[0];
      const nom = nomStock(ligne.cle);

      try {
        await env.STOCKS_DB
          .prepare("UPDATE attentes SET prevenuLe = ?1 WHERE cle = ?2 AND email = ?3")
          .bind(Date.now(), ligne.cle, ligne.email)
          .run();

        await sendEmail(env, {
          to: ligne.email,
          ...retourEnStockClient({ id, nom }, siteUrl),
        });
        envoyes++;
      } catch (e) {
        console.error("[attentes] Envoi KO pour", ligne.cle, ":", e.message);
      }
    }
    return envoyes;
  } catch (e) {
    console.error("[attentes] Passage KO :", e.message);
    return 0;
  }
}

/**
 * Les références les plus attendues — ce que les clients réclament.
 *
 * C'est la sortie utile pour le commerçant : une liste de ce qu'il faut
 * recommander en priorité, classée par la demande réelle et non par
 * l'intuition.
 */
export async function listerAttentes(db, limite = 30) {
  const { results = [] } = await db
    .prepare(
      `SELECT cle, COUNT(*) AS attendus, MIN(creeLe) AS depuis
         FROM attentes
        WHERE prevenuLe IS NULL
        GROUP BY cle
        ORDER BY attendus DESC, depuis ASC
        LIMIT ?1`
    )
    .bind(limite)
    .all();

  return results.map((r) => ({
    ...r,
    nom: nomStock(r.cle),
  }));
}
