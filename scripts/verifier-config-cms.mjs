/**
 * scripts/verifier-config-cms.mjs
 * Contrôle la configuration de l'éditeur de contenu AVANT de déployer.
 *
 * Decap ne valide sa configuration qu'au chargement, dans le navigateur : une
 * faute passe le build, passe le déploiement, et se découvre en ouvrant
 * l'admin — remplacé par « Error loading the CMS configuration », sans plus
 * aucun accès aux fiches produits. C'est exactement ce qui est arrivé avec un
 * champ `sousCategorie` déclaré deux fois.
 *
 * Ce script rejoue les règles qui cassent tout, à la construction.
 *
 *   node scripts/verifier-config-cms.mjs
 */

import { readFileSync } from "node:fs";

const FICHIER = "admin/contenu/config.yml";

let yaml;
try {
  yaml = (await import("js-yaml")).default;
} catch {
  // Dépendance indirecte : son absence ne doit pas casser le build, mais on
  // le dit clairement plutôt que de laisser croire à un contrôle effectué.
  console.warn("[cms] ⚠ js-yaml indisponible — configuration NON vérifiée");
  process.exit(0);
}

const problemes = [];

let config;
try {
  config = yaml.load(readFileSync(FICHIER, "utf8"));
} catch (err) {
  console.error(`[cms] ✕ ${FICHIER} illisible : ${err.message}`);
  process.exit(1);
}

/** Decap refuse deux champs de même nom au même niveau. */
function verifierChamps(champs, chemin) {
  if (!Array.isArray(champs)) return;

  const vus = new Set();
  for (const champ of champs) {
    if (!champ || typeof champ !== "object") continue;

    if (!champ.name) problemes.push(`${chemin} : un champ sans « name »`);
    else if (vus.has(champ.name)) problemes.push(`${chemin} : champ « ${champ.name} » déclaré deux fois`);
    else vus.add(champ.name);

    // Les widgets object/list imbriquent leurs propres champs.
    verifierChamps(champ.fields, `${chemin} › ${champ.name}`);
    if (champ.field) verifierChamps(champ.field.fields, `${chemin} › ${champ.name}`);
  }
}

const collections = config?.collections || [];
if (!collections.length) problemes.push("aucune collection déclarée");

const nomsCollections = new Set();
for (const [i, col] of collections.entries()) {
  const nom = col.name || `#${i}`;
  if (nomsCollections.has(col.name)) problemes.push(`collection « ${nom} » déclarée deux fois`);
  nomsCollections.add(col.name);

  verifierChamps(col.fields, `collection « ${nom} »`);
  for (const fichier of col.files || []) {
    verifierChamps(fichier.fields, `collection « ${nom} » › ${fichier.name || fichier.file}`);
  }
}

// Une faute de frappe ici et l'admin ne se connecte plus du tout.
if (!config?.backend?.repo) problemes.push("backend.repo manquant");
if (!config?.backend?.base_url) problemes.push("backend.base_url manquant");

if (problemes.length) {
  console.error(`[cms] ✕ ${FICHIER} — Decap refuserait cette configuration :`);
  for (const p of problemes) console.error(`       · ${p}`);
  process.exit(1);
}

const total = collections.reduce(
  (n, c) => n + (c.fields?.length || 0) + (c.files || []).reduce((m, f) => m + (f.fields?.length || 0), 0), 0);
console.log(`[cms] ✓ ${collections.length} collections, ${total} champs — configuration valide`);
