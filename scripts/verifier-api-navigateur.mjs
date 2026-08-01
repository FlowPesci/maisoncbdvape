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

const SOURCE = "src/assets/js/tabacgex.js";
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
const definies = new Map(NAMESPACES.map((n) => [n, new Set()]));
for (const f of [SOURCE, ...fichiers("src/_includes", [".njk"])]) {
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
for (const f of fichiers("src", [".njk", ".html", ".js"])) {
  const contenu = readFileSync(f, "utf8");
  for (const ns of NAMESPACES) {
    for (const m of contenu.matchAll(new RegExp(`${ns}\\.(\\w+)`, "g"))) {
      if (!definies.get(ns).size) continue;          // namespace non trouvé : on ne juge pas
      if (!definies.get(ns).has(m[1])) problemes.push({ f, appel: `${ns}.${m[1]}` });
    }
  }
}

if (problemes.length) {
  console.error(`[api] ✕ ${problemes.length} appel(s) à une méthode inexistante :`);
  for (const p of problemes) console.error(`       · ${p.appel}  →  ${p.f}`);
  console.error("\n       Ces appels lèvent un TypeError chez le visiteur, sans que rien");
  console.error("       ne le signale à la construction. Corriger le nom, ou définir la méthode.");
  process.exit(1);
}

const total = NAMESPACES.map((n) => `${n} (${definies.get(n).size})`).join(", ");
console.log(`[api] ✓ tous les appels correspondent à une méthode existante — ${total}`);
