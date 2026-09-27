/**
 * scripts/origines.mjs
 * Origine géographique d'un produit — source unique.
 *
 * ─── Pourquoi ce fichier existe ───────────────────────────────────────────
 * La carte CBD (`src/categories/categorie.njk`) affichait un drapeau écrit en
 * dur, et **par panneau** : 🇫🇷 sur toute la colonne Indoor, 🇨🇭 sur le seul
 * Extract Crumble, 🇪🇺 sur les Small Buds. Le commerçant ne pouvait pas le
 * changer, et surtout : la carte contredisait les fiches. Le Moon Rock
 * annonçait « Origine : Union européenne » sur sa page produit et 🇫🇷 sur la
 * carte, à deux clics d'écart.
 *
 * Une origine est une mention commerciale (art. L121-2 du code de la
 * consommation, comme le prix). Deux versions contradictoires sur le même
 * site, c'est exactement la famille de défaut que `prix-fiche.mjs` a fermée
 * du côté des tarifs : une règle écrite à deux endroits finit par diverger.
 *
 * ⚠ Liste FERMÉE, volontairement. En saisie libre, « Suisse », « suisse » et
 * « CH » produiraient trois valeurs distinctes dont aucune n'a de drapeau, et
 * la carte se dégraderait en silence.
 *
 * ⚠ `admin/contenu/config.yml` en porte une copie — il est recopié tel quel
 * vers `public/`, les filtres Nunjucks n'y sont pas évalués, la liste ne peut
 * donc pas y être générée depuis ici. `verify:carte` compare les deux et fait
 * échouer la construction si elles divergent : c'est le garde-fou qui rend la
 * duplication acceptable.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * `value` est ce qui est écrit dans la fiche JSON ; il ne doit JAMAIS changer
 * sans migration des fiches existantes. `label` et `drapeau` sont de
 * l'affichage et peuvent évoluer librement.
 */
export const ORIGINES = [
  { value: "france", label: "France", drapeau: "🇫🇷", code: "FR" },
  { value: "suisse", label: "Suisse", drapeau: "🇨🇭", code: "CH" },
  { value: "union-europeenne", label: "Union européenne", drapeau: "🇪🇺", code: "UE" },
  { value: "italie", label: "Italie", drapeau: "🇮🇹", code: "IT" },
  { value: "espagne", label: "Espagne", drapeau: "🇪🇸", code: "ES" },
  { value: "autre", label: "Autre origine", drapeau: "🌍", code: "—" },
];

/** Les valeurs acceptées, pour les contrôles. */
export const VALEURS_ORIGINE = ORIGINES.map((o) => o.value);

/**
 * Le drapeau d'un produit, ou une chaîne vide.
 *
 * ⚠ Renvoie "" — et non un drapeau par défaut — quand l'origine est absente
 * ou inconnue. Inventer 🇫🇷 sur une fiche non renseignée serait une mention
 * commerciale fausse produite par le gabarit lui-même, ce qui est pire que
 * l'absence d'information.
 */
export function drapeauOrigine(origine) {
  if (!origine) return "";
  const trouve = ORIGINES.find((o) => o.value === String(origine).trim());
  return trouve ? trouve.drapeau : "";
}

/** Le libellé lisible, pour la fiche produit et les attributs `title`. */
export function libelleOrigine(origine) {
  if (!origine) return "";
  const trouve = ORIGINES.find((o) => o.value === String(origine).trim());
  return trouve ? trouve.label : "";
}
