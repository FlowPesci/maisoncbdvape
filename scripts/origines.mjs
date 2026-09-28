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
/**
 * ⚠ Pourquoi des SVG et non les émojis drapeaux.
 *
 * Le 2026-09-28, le commerçant a signalé que la colonne « Orig. » affichait
 * « IT », « EU » au lieu de drapeaux. Le HTML contenait pourtant bien 🇮🇹 :
 * **Windows ne fournit aucune police de drapeaux**, et les navigateurs y
 * rendent à la place le couple de lettres qui compose le caractère. Un
 * visiteur sur iPhone voyait un drapeau, un visiteur sur PC deux lettres —
 * et la majorité des clients sont sur PC.
 *
 * Les drapeaux sont donc **dessinés ici**, en SVG, servis avec la page :
 * identiques partout, et aucun appel extérieur — ce site n'en fait aucun,
 * c'est une règle du projet (voir les polices auto-hébergées).
 *
 * ⚠ Ce sont des dessins SIMPLIFIÉS, assumés : à 18 px de large, les douze
 * étoiles européennes deviennent des points et la bannière étoilée perd ses
 * cinquante étoiles. Le but est la reconnaissance immédiate, pas l'exactitude
 * héraldique. Ne pas les « corriger » en ajoutant du détail invisible.
 *
 * `emoji` est conservé pour deux usages : les libellés de `config.yml` — que
 * Decap affiche dans un menu déroulant, où le rendu système suffit — et le
 * contrôle de `verify:carte`, qui refuse qu'un drapeau réapparaisse en dur
 * dans un gabarit.
 */
const cadre = (contenu) =>
  `<svg viewBox="0 0 3 2" width="18" height="12" role="img" aria-hidden="true" ` +
  `style="display:inline-block;vertical-align:middle;border-radius:1px;">${contenu}</svg>`;

/** Trois bandes verticales, le motif le plus courant. */
const bandesV = (a, b, c) =>
  cadre(`<rect width="1" height="2" fill="${a}"/>` +
        `<rect x="1" width="1" height="2" fill="${b}"/>` +
        `<rect x="2" width="1" height="2" fill="${c}"/>`);

/**
 * Les douze « étoiles » européennes, réduites à des points.
 *
 * ⚠ Les rayons ont été mesurés, pas devinés. Une première version posait des
 * points de rayon 0,09 sur un cercle de 0,62 : rapporté à un rendu de 18 px de
 * large, cela fait **un demi-pixel** — invisible, le drapeau n'était qu'un
 * rectangle bleu. 0,13 sur un cercle de 0,60 donne des points d'environ un
 * pixel, deux sur un écran à haute densité, sans qu'ils se touchent.
 */
const etoilesUE = Array.from({ length: 12 }, (_, i) => {
  const a = (i * Math.PI) / 6;
  const x = (1.5 + 0.6 * Math.sin(a)).toFixed(3);
  const y = (1 - 0.6 * Math.cos(a)).toFixed(3);
  return `<circle cx="${x}" cy="${y}" r="0.13" fill="#FFCC00"/>`;
}).join("");

export const ORIGINES = [
  {
    value: "france", label: "France", emoji: "🇫🇷", code: "FR",
    svg: bandesV("#002654", "#FFFFFF", "#ED2939"),
  },
  {
    value: "suisse", label: "Suisse", emoji: "🇨🇭", code: "CH",
    // Le drapeau suisse est carré : on le dessine carré, centré dans le cadre.
    svg: cadre(
      `<rect x="0.5" width="2" height="2" fill="#D52B1E"/>` +
      `<rect x="1.32" y="0.45" width="0.36" height="1.1" fill="#fff"/>` +
      `<rect x="0.95" y="0.82" width="1.1" height="0.36" fill="#fff"/>`,
    ),
  },
  {
    value: "union-europeenne", label: "Union européenne", emoji: "🇪🇺", code: "UE",
    svg: cadre(`<rect width="3" height="2" fill="#003399"/>${etoilesUE}`),
  },
  {
    value: "italie", label: "Italie", emoji: "🇮🇹", code: "IT",
    svg: bandesV("#009246", "#F1F2F1", "#CE2B37"),
  },
  {
    value: "espagne", label: "Espagne", emoji: "🇪🇸", code: "ES",
    svg: cadre(
      `<rect width="3" height="2" fill="#AA151B"/>` +
      `<rect y="0.5" width="3" height="1" fill="#F1BF00"/>`,
    ),
  },
  {
    value: "etats-unis", label: "États-Unis", emoji: "🇺🇸", code: "US",
    svg: cadre(
      `<rect width="3" height="2" fill="#FFFFFF"/>` +
      Array.from({ length: 7 }, (_, i) =>
        `<rect y="${(i * 2 / 13 * 2).toFixed(3)}" width="3" height="${(2 / 13).toFixed(3)}" fill="#B22234"/>`,
      ).join("") +
      `<rect width="1.2" height="${(2 / 13 * 7).toFixed(3)}" fill="#3C3B6E"/>` +
      // Six points pour cinquante étoiles : à cette taille, tout détail
      // supplémentaire se referme en une tache. Rayon porté de 0,075 à 0,11
      // pour la même raison que les points européens.
      Array.from({ length: 6 }, (_, i) => {
        const x = (0.22 + (i % 3) * 0.38).toFixed(3);
        const y = (0.28 + Math.floor(i / 3) * 0.5).toFixed(3);
        return `<circle cx="${x}" cy="${y}" r="0.11" fill="#fff"/>`;
      }).join(""),
    ),
  },
  {
    value: "autre", label: "Autre origine", emoji: "🌍", code: "—",
    svg: cadre(
      `<circle cx="1.5" cy="1" r="0.82" fill="none" stroke="#8A8178" stroke-width="0.16"/>` +
      // ⚠ Le méridien est une ELLIPSE (rx 0.4, ry 0.82), pas un cercle : avec
      //   un rayon horizontal proche de la corde, l'arc se redresse et le
      //   globe ressemble à un « ø ». Première version écrite avec rx 1.9.
      `<path d="M0.68 1h1.64M1.5 0.18a0.4 0.82 0 0 1 0 1.64a0.4 0.82 0 0 1 0-1.64" ` +
      `fill="none" stroke="#8A8178" stroke-width="0.13"/>`,
    ),
  },
];

/** Les valeurs acceptées, pour les contrôles. */
export const VALEURS_ORIGINE = ORIGINES.map((o) => o.value);

/**
 * Le drapeau d'un produit, en SVG, ou une chaîne vide.
 *
 * ⚠ Renvoie "" — et non un drapeau par défaut — quand l'origine est absente
 * ou inconnue. Inventer un drapeau français sur une fiche non renseignée
 * serait une mention commerciale fausse produite par le gabarit lui-même, ce
 * qui est pire que l'absence d'information.
 *
 * ⚠ La sortie est du BALISAGE : le gabarit doit écrire `| drapeau | safe`.
 * Sans `safe`, Nunjucks échappe le SVG et la colonne affiche son code source.
 */
export function drapeauOrigine(origine) {
  if (!origine) return "";
  const trouve = ORIGINES.find((o) => o.value === String(origine).trim());
  return trouve ? trouve.svg : "";
}

/** Le libellé lisible, pour la fiche produit et les attributs `title`. */
export function libelleOrigine(origine) {
  if (!origine) return "";
  const trouve = ORIGINES.find((o) => o.value === String(origine).trim());
  return trouve ? trouve.label : "";
}
