import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * src/_data/ouverture.js
 * Les horaires d'ouverture, sous les DEUX formes dont le site a besoin :
 * la phrase du pied de page et le balisage `openingHoursSpecification`.
 *
 * ⚠ Elles vivaient déjà en DOUBLE dans `site.json`, et personne ne l'avait vu :
 *
 *   · `horaires` — un tableau de texte libre (« Lun, Mar, Jeu, Ven » /
 *     « 7h30–12h30 / 14h–19h »), lu par le pied de page ;
 *   · `livraison["click-and-collect"].horairesRetrait` — la même information
 *     en machine, par jour de la semaine, lue par le tunnel de commande pour
 *     proposer les créneaux de retrait.
 *
 *   Les deux disaient la même chose au 2026-10-10. Rien ne le garantissait :
 *   le commerçant change ses horaires, corrige la phrase du pied de page, et
 *   le site continue de proposer un retrait à 14 h un jour où il est fermé —
 *   ou l'inverse. C'est la famille de défaut que `prix-fiche.mjs` a fermée
 *   côté tarifs et `origines.mjs` côté drapeaux.
 *
 * **`horairesRetrait` gagne, et c'est volontaire** : c'est la forme que le
 * SERVEUR interroge pour accepter ou refuser un créneau. Une phrase ne peut
 * pas arbitrer une commande ; une table d'heures, si. Le texte du pied de
 * page en est désormais dérivé, et `site.horaires` a été supprimé.
 *
 * ⚠ Changer un horaire, c'est donc modifier `horairesRetrait` — un seul
 * endroit, et les créneaux de retrait, le pied de page et la fiche Google
 * (via le balisage) bougent ensemble.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const site = JSON.parse(readFileSync(resolve(__dirname, "site.json"), "utf8"));

/** Clés de `horairesRetrait` : 0 = dimanche, comme `Date.getDay()`. */
const NOMS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const COURTS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Ordre de lecture français : la semaine commence le lundi. */
const SEMAINE = [1, 2, 3, 4, 5, 6, 0];

// ⚠ Le chemin est `livraison.modes[…]`, pas `livraison[…]`. Ma première
//   version sautait `modes` : elle ne levait aucune erreur, lisait un objet
//   vide, et produisait un pied de page SANS horaires et un balisage sans
//   `openingHoursSpecification`. Vu uniquement en exécutant le fichier.
//   D'où le garde-fou ci-dessous : ici, le silence n'est pas une option.
const creneaux = site.livraison?.modes?.["click-and-collect"]?.horairesRetrait || {};

if (!Object.keys(creneaux).length) {
  throw new Error(
    "[ouverture] Aucun horaire lu dans site.json → livraison.modes['click-and-collect']" +
    ".horairesRetrait. Le pied de page et le balisage seraient muets : on arrête la" +
    " construction plutôt que de publier une boutique sans horaires."
  );
}

/** « 07:30 » → « 7h30 » ; « 14:00 » → « 14h ». */
function heureFr(hhmm) {
  const [h, m] = String(hhmm).split(":");
  return `${Number(h)}h${m === "00" ? "" : m}`;
}

/** Une journée entière : « 7h30–12h30 / 14h–19h ». */
function journeeFr(plages) {
  return plages.map(([a, b]) => `${heureFr(a)}–${heureFr(b)}`).join(" / ");
}

// ── Le texte du pied de page ───────────────────────────────────────────────
//
// Les jours qui ont EXACTEMENT le même horaire sont regroupés, même s'ils ne
// se suivent pas — « Lun, Mar, Jeu, Ven » saute le mercredi, qui ferme à midi.
// Un jour seul s'écrit en toutes lettres (« Samedi »), un groupe en abrégé :
// c'est la forme qui était écrite à la main, reproduite à l'identique.
const groupes = [];
for (const j of SEMAINE) {
  const plages = creneaux[String(j)];
  if (!plages?.length) continue; // jour de fermeture : pas de ligne
  const heures = journeeFr(plages);
  const existant = groupes.find((g) => g.heures === heures);
  if (existant) existant.jours.push(j);
  else groupes.push({ heures, jours: [j] });
}

export const lignes = groupes.map((g) => ({
  jours: g.jours.length === 1 ? NOMS[g.jours[0]] : g.jours.map((j) => COURTS[j]).join(", "),
  heures: g.heures,
}));

// ── Le balisage ────────────────────────────────────────────────────────────
//
// ⚠ Une entrée par PLAGE, jamais une par jour : schema.org n'a pas de notion
// de coupure méridienne. « 7h30–12h30 / 14h–19h » se déclare en deux
// `OpeningHoursSpecification` portant le même jour. Les fusionner en
// 7h30–19h annoncerait une boutique ouverte à l'heure du déjeuner — une
// information fausse affichée par Google, pas par nous.
export const jsonld = [];
for (const j of SEMAINE) {
  for (const [ouvre, ferme] of creneaux[String(j)] || []) {
    jsonld.push({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${EN[j]}`,
      opens: ouvre,
      closes: ferme,
    });
  }
}

export default { lignes, jsonld };
