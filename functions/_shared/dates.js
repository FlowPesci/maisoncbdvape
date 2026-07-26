/**
 * functions/_shared/dates.js
 * Mise en forme des dates pour les e-mails envoyés depuis les Workers.
 *
 * Les créneaux de retrait sont stockés au format ISO (« 2026-07-27 ») parce
 * que c'est ce qui se trie et se compare correctement. Mais ce format n'a
 * rien à faire sous les yeux d'un client français : il s'affiche en toutes
 * lettres.
 *
 * ⚠ Le pendant navigateur de ce module vit dans `src/assets/js/tabacgex.js`
 *   (`window.MCV_DATE`). Les deux ne peuvent pas partager de fichier — l'un
 *   tourne dans un Worker, l'autre dans la page — mais ils doivent rendre le
 *   même texte. Toute modification ici doit y être reportée.
 * ─────────────────────────────────────────────────────────────────────────── */

// @ts-check

/** La boutique est à Gex : tout s'affiche à l'heure de Paris. */
const FUSEAU = "Europe/Paris";

/**
 * Accepte une date ISO (« 2026-07-27 »), un horodatage en millisecondes ou
 * un objet Date. Renvoie null si la valeur est inexploitable, pour que
 * l'appelant puisse afficher son propre repli plutôt qu'un « Invalid Date ».
 *
 * @returns {Date|null}
 */
function versDate(valeur) {
  if (valeur instanceof Date) return isNaN(valeur.getTime()) ? null : valeur;
  if (typeof valeur === "number") {
    const d = new Date(valeur);
    return isNaN(d.getTime()) ? null : d;
  }
  const texte = String(valeur || "").trim();
  if (!texte) return null;

  // Une date seule est interprétée en UTC par le moteur JS ; on la ramène à
  // minuit local pour qu'un créneau du 27 ne s'affiche pas le 26 au soir.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(texte) ? texte + "T00:00:00" : texte);
  return isNaN(d.getTime()) ? null : d;
}

/** « lundi 27 juillet 2026 » — pour ce que lit un client. */
export function dateLongue(valeur, repli = "—") {
  const d = versDate(valeur);
  if (!d) return repli;
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: FUSEAU,
  }).format(d);
}

/** « 27/07/2026 » — pour les tableaux, où la place manque. */
export function dateCourte(valeur, repli = "—") {
  const d = versDate(valeur);
  if (!d) return repli;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: FUSEAU,
  }).format(d);
}

/** « 27/07/2026 à 07:30 ». */
export function dateHeure(valeur, repli = "—") {
  const d = versDate(valeur);
  if (!d) return repli;
  const date = dateCourte(d);
  const heure = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit", minute: "2-digit", timeZone: FUSEAU,
  }).format(d);
  return `${date} à ${heure}`;
}
