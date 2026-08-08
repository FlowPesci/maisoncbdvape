/**
 * scripts/verifier-api-navigateur.mjs
 * Vérifie que les gabarits n'appellent que des méthodes qui existent
 * réellement sur `window.MCV_DATE` et `window.MCV_ADMIN`.
 *
 * ─── Pourquoi ce script existe ────────────────────────────────────────────
 * `window.MCV_DATE` expose `courte()`, tandis que son pendant serveur
 * (`functions/_shared/dates.js`) exporte `dateCourte()`. Les deux modules
 * rendent le même texte et portent des noms différents — un appel à
 * `MCV_DATE.dateCourte()` s'écrit donc tout seul, ne casse rien au build, et
 * lève un TypeError chez le visiteur.
 *
 * C'est exactement ce qui s'était produit sur l'écran des avis.
 * ─────────────────────────────────────────────────────────────────────────── */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const NAMESPACES = ["MCV_DATE", "MCV_ADMIN"];

function fichiers(dossier, extensions) {
  const out = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) out.push(...fichiers(chemin, extensions));
    else if (extensions.includes(extname(nom))) out.push(chemin);
  }
  return out;
}

// Les méthodes réellement définies, lues dans les sources du navigateur.
// ⚠ Le chantier CSP (voir CLAUDE.md) a sorti la plupart des <script> inline
// vers src/assets/js/ — MCV_ADMIN, par exemple, se définit maintenant dans
// admin-nav.js, plus dans un gabarit. Ne scanner que src/_includes/ rendait
// ce contrôle aveugle en silence (namespace "non trouvé" = pas jugé, ligne
// plus bas) : il faut aussi lire src/assets/js/.
const definies = new Map(NAMESPACES.map((n) => [n, new Set()]));
for (const f of [...fichiers("src/assets/js", [".js"]), ...fichiers("src/_includes", [".njk"])]) {
  const contenu = readFileSync(f, "utf8");
  for (const ns of NAMESPACES) {
    const bloc = contenu.split(`window.${ns} =`)[1];
    if (!bloc) continue;
    // `nom:` ou `nom(` en tête de propriété — les deux formes d'un objet JS.
    for (const m of bloc.slice(0, 4000).matchAll(/^\s{2,6}(\w+)\s*[:(]/gm)) {
      definies.get(ns).add(m[1]);
    }
  }
}

const problemes = [];
const namespaceIntrouvable = new Set();
for (const f of fichiers("src", [".njk", ".html", ".js"])) {
  const contenu = readFileSync(f, "utf8");
  for (const ns of NAMESPACES) {
    for (const m of contenu.matchAll(new RegExp(`${ns}\\.(\\w+)`, "g"))) {
      // Namespace appelé mais son point de définition (`window.NS = {...}`)
      // introuvable dans les sources scannées : ne pas juger silencieusement
      // en passerait à côté — c'est exactement l'inverse du but de ce script.
      if (!definies.get(ns).size) { namespaceIntrouvable.add(ns); continue; }
      if (!definies.get(ns).has(m[1])) problemes.push({ f, appel: `${ns}.${m[1]}` });
    }
  }
}

/**
 * ─── Garde-fou : plus de jeton dans localStorage ────────────────────────────
 * Le jeton d'administration vivait dans localStorage — lisible par tout
 * script s'exécutant sur le domaine, y compris injecté. Il vit maintenant
 * côté serveur (functions/_shared/session.js), retrouvé par un cookie
 * HttpOnly. Si `localStorage.setItem`/`getItem` réapparaît sur une clé dont
 * le nom évoque un jeton, le build échoue plutôt que de laisser la régression
 * passer inaperçue.
 */
const jetonsEnStorage = [];
for (const f of [...fichiers("src", [".njk", ".html", ".js"]), ...fichiers("admin", [".html", ".js"])]) {
  const contenu = readFileSync(f, "utf8");
  for (const m of contenu.matchAll(/localStorage\.(?:setItem|getItem)\(\s*['"]([^'"]*)['"]/g)) {
    if (/token/i.test(m[1])) jetonsEnStorage.push({ f, cle: m[1] });
  }
}

if (namespaceIntrouvable.size || jetonsEnStorage.length || problemes.length) {
  if (namespaceIntrouvable.size) {
    console.error(`[api] ✕ point de définition introuvable pour : ${[...namespaceIntrouvable].join(", ")}`);
    console.error("\n       Ces namespaces sont appelés (ex. MCV_ADMIN.xxx()) mais leur");
    console.error("       `window.NS = { ... }` n'a été trouvé dans aucun fichier scanné");
    console.error("       (src/assets/js/**/*.js, src/_includes/**/*.njk). A-t-il été déplacé ?");
    console.error("       Sans lui, ce contrôle ne peut plus rien vérifier pour ce namespace.");
  }
  if (problemes.length) {
    console.error(`[api] ✕ ${problemes.length} appel(s) à une méthode inexistante :`);
    for (const p of problemes) console.error(`       · ${p.appel}  →  ${p.f}`);
    console.error("\n       Ces appels lèvent un TypeError chez le visiteur, sans que rien");
    console.error("       ne le signale à la construction. Corriger le nom, ou définir la méthode.");
  }
  if (jetonsEnStorage.length) {
    console.error(`[api] ✕ ${jetonsEnStorage.length} clé(s) de type jeton dans localStorage :`);
    for (const j of jetonsEnStorage) console.error(`       · "${j.cle}"  →  ${j.f}`);
    console.error("\n       Le jeton d'administration doit rester côté serveur (cookie HttpOnly,");
    console.error("       voir functions/_shared/session.js), jamais dans localStorage.");
  }
  process.exit(1);
}

const total = NAMESPACES.map((n) => `${n} (${definies.get(n).size})`).join(", ");
console.log(`[api] ✓ tous les appels correspondent à une méthode existante — ${total}`);
console.log("[api] ✓ aucun jeton dans localStorage");
