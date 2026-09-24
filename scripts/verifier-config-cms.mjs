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

/**
 * Les options d'un `select` ne peuvent valoir qu'une chaîne ou un nombre.
 *
 * Un booléen y est refusé par le schéma de Decap, et le refus n'est pas
 * local : l'éditeur entier s'arrête sur « Error loading the CMS
 * configuration », plus aucune fiche n'est modifiable. C'est arrivé le
 * 2026-09-09 avec `liquideRemplissable`, dont les options valaient `true` et
 * `false` — ce qui semblait pourtant le type naturel pour un oui/non.
 *
 * Le défaut ne se voit qu'en ouvrant l'éditeur dans un navigateur : le
 * fichier est du YAML valide, et le reste du contrôle passait au vert.
 */
function verifierOptions(champ, chemin) {
  if (!Array.isArray(champ.options)) return;
  for (const [i, opt] of champ.options.entries()) {
    const valeur = opt && typeof opt === "object" ? opt.value : opt;
    const type = typeof valeur;
    if (type !== "string" && type !== "number") {
      problemes.push(
        `${chemin} › ${champ.name} : option #${i} de type ${type} ` +
        `(${JSON.stringify(valeur)}) — Decap n'accepte qu'une chaîne ou un nombre`,
      );
    }
  }
}

/** Decap refuse deux champs de même nom au même niveau. */
/**
 * Un `summary` Decap n'interprète que les `{{ … }}`.
 *
 * Les balises de contrôle `{% if %}` / `{% for %}` y sont rendues **telles
 * quelles**, sous les yeux du commerçant. La ligne repliée d'une variante
 * affichait « Space Dream{% if fields.prix %} — 15.99 €{% endif %} » —
 * constaté le 2026-09-24, et probablement en place depuis l'origine : le
 * défaut est purement visuel, donc aucun contrôle ne le voyait et personne
 * ne le lisait comme une anomalie.
 *
 * Même règle pour `label_singular`, `summary` de collection et `preview_path`.
 */
function verifierSummary(objet, chemin) {
  for (const cle of ["summary", "label_singular", "preview_path"]) {
    const v = objet?.[cle];
    if (typeof v === "string" && /\{%/.test(v)) {
      problemes.push(
        `${chemin} : « ${cle} » contient une balise {% … %}, que Decap affiche ` +
        `en clair au lieu de l'interpréter — n'utiliser que {{ champ }}`
      );
    }
  }
}

function verifierChamps(champs, chemin) {
  if (!Array.isArray(champs)) return;

  const vus = new Set();
  for (const champ of champs) {
    if (!champ || typeof champ !== "object") continue;

    if (!champ.name) problemes.push(`${chemin} : un champ sans « name »`);
    else if (vus.has(champ.name)) problemes.push(`${chemin} : champ « ${champ.name} » déclaré deux fois`);
    else vus.add(champ.name);

    verifierOptions(champ, chemin);
    verifierSummary(champ, chemin);

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

  // La collection porte elle aussi un `summary` (la ligne de la liste des
  // fiches) et un `label_singular`, soumis à la même limite.
  verifierSummary(col, `collection « ${nom} »`);

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
