/**
 * scripts/verifier-classes-css.mjs
 * Détecte les classes utilisées dans les pages sans aucune règle CSS.
 *
 * ─── Pourquoi ce script existe ────────────────────────────────────────────
 * Le rebranding a débranché `src/assets/css/tabacgex.css` du gabarit sans
 * retirer les classes des pages. Résultat : 24 composants ont perdu leur
 * habillage **en silence** — badges de stock, boutons de quantité, onglets
 * de fiche produit, cartes d'avis, boutons d'action de onze pages… et la
 * barre d'achat mobile, qui restait affichée en permanence par-dessus le
 * contenu faute de son état masqué.
 *
 * Rien n'a signalé le problème : ni le build, ni le navigateur. Une classe
 * inconnue n'est pas une erreur en CSS, c'est un silence. Ce script rompt
 * ce silence.
 *
 *   node scripts/verifier-classes-css.mjs
 *
 * Lancé par `npm run build`, il fait échouer la construction plutôt que de
 * laisser partir en production une page à moitié stylée.
 * ─────────────────────────────────────────────────────────────────────────── */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const CSS = "src/assets/css/tailwind.css";

/**
 * Préfixes des utilitaires Tailwind : ils sont générés à la demande et leur
 * absence ne signale rien d'anormal. On ne contrôle que les classes
 * « maison », celles qui décrivent un composant.
 */
const UTILITAIRES = /^(text|bg|border|from|via|to|fill|stroke|ring|divide|placeholder|accent|caret|shadow|opacity|blur|backdrop|filter|flex|grid|col|row|items|justify|content|self|place|gap|space|order|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|h|min|max|size|inset|top|bottom|left|right|z|font|leading|tracking|align|whitespace|break|list|indent|underline|line|decoration|uppercase|lowercase|capitalize|normal|italic|not|antialiased|subpixel|truncate|overflow|overscroll|object|aspect|columns|float|clear|isolate|isolation|table|caption|border|rounded|outline|transition|duration|delay|ease|animate|transform|translate|rotate|scale|skew|origin|cursor|select|resize|scroll|snap|touch|will|appearance|pointer|visible|invisible|collapse|static|fixed|absolute|relative|sticky|block|inline|hidden|contents|sr|group|peer|container|mix|bg)$/;

/**
 * Classes qui servent UNIQUEMENT de point d'accroche au JavaScript ou aux
 * gabarits : elles n'ont pas de style parce qu'elles n'en ont pas besoin,
 * l'apparence étant portée par des styles en ligne ou des utilitaires.
 * Les lister explicitement vaut mieux que de désactiver le contrôle : une
 * classe absente de cette liste ET sans style est forcément une anomalie.
 */
const SANS_STYLE_ASSUME = new Set([
  "cat-tab",            // onglets boutique : couleurs appliquées par le script
  "product-item",       // enveloppe de grille, masquée/affichée par le filtre
  "error-msg",          // message d'erreur de formulaire, classes Tailwind
  "mobile-sub",         // sous-menu mobile, ouvert/fermé par le script
  "mobile-sub-toggle",
  "mode-btn",           // sélecteur de mode de livraison : filet et fond
  "mode-apercu",        // modes de livraison non ouverts à la vente
  "mode-icon",          // pastille et libellé du sélecteur de mode :
  "mode-label",         //   le script en pilote les couleurs
]);

/** Variantes responsives et d'état : on ne garde que la classe de base. */
const VARIANTES = /^(sm|md|lg|xl|2xl|hover|focus|active|disabled|first|last|odd|even|group-hover|peer-focus|motion-safe|motion-reduce|dark|print|focus-within|focus-visible|visited|checked|required|invalid|placeholder)$/;

function fichiers(dossier, extensions) {
  const out = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) out.push(...fichiers(chemin, extensions));
    else if (extensions.includes(extname(nom))) out.push(chemin);
  }
  return out;
}

if (!existsSync(CSS)) {
  console.error(`[css] ✕ ${CSS} introuvable — lancer \`npm run css\` d'abord`);
  process.exit(1);
}
const feuille = readFileSync(CSS, "utf8");

// Classes rencontrées dans les attributs `class="…"` des gabarits et dans les
// `classList` / chaînes de gabarit du JavaScript.
const utilisees = new Map();   // classe → fichiers où elle apparaît

for (const fichier of fichiers("src", [".njk", ".html", ".js"])) {
  if (fichier.includes(`assets${"/"}css`)) continue;
  // Les balises Nunjucks sont retirées AVANT l'extraction : sans cela, un
  // `class="x {% if … %}y{% endif %}"` ferait passer `if`, `endif` et les
  // noms de variables pour des classes.
  const contenu = readFileSync(fichier, "utf8")
    .replace(/\{%[\s\S]*?%\}/g, " ")
    .replace(/\{\{[\s\S]*?\}\}/g, " ")
    .replace(/\{#[\s\S]*?#\}/g, " ");

  for (const m of contenu.matchAll(/class(?:Name)?="([^"]+)"/g)) {
    for (const brut of m[1].split(/\s+/)) {
      // On ignore ce qui vient d'un template : `${…}` n'est pas une classe.
      if (!brut || brut.includes("{") || brut.includes("$")) continue;

      const sansVariantes = brut.split(":").filter((p) => !VARIANTES.test(p)).join(":");
      const classe = sansVariantes.split("/")[0];       // bg-dark-card/40 → bg-dark-card
      if (!classe || classe.includes(":")) continue;
      if (!/^[a-z][a-z0-9-]*$/.test(classe)) continue;
      if (UTILITAIRES.test(classe.split("-")[0])) continue;
      if (SANS_STYLE_ASSUME.has(classe)) continue;

      if (!utilisees.has(classe)) utilisees.set(classe, new Set());
      utilisees.get(classe).add(fichier);
    }
  }
}

const orphelines = [...utilisees.entries()]
  .filter(([classe]) => !new RegExp(`\\.${classe}[\\s{,:.>]`).test(feuille))
  .sort();

if (orphelines.length) {
  console.error(`[css] ✕ ${orphelines.length} classe(s) utilisée(s) sans aucune règle CSS :`);
  for (const [classe, dans] of orphelines) {
    const liste = [...dans].slice(0, 3).join(", ");
    console.error(`       · .${classe}  →  ${liste}${dans.size > 3 ? ` (+${dans.size - 3})` : ""}`);
  }
  console.error("\n       Ces éléments s'affichent sans habillage. Définir ces classes");
  console.error("       dans tailwind/input.css, ou les retirer des gabarits.");
  process.exit(1);
}

console.log(`[css] ✓ ${utilisees.size} classes de composant, toutes définies`);
