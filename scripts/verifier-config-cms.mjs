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

// ─────────────────────────────────────────────────────────────────────────
// Le champ déclaré et la donnée ont-ils la même forme ?
//
// ⚠ Tout ce qui précède ne contrôle que la COHÉRENCE INTERNE du fichier de
// configuration. Rien ne le comparait aux fiches réelles — et c'est
// précisément la faille qui a laissé pourrir `ficheTechnique` : déclarée
// `widget: list` dans ce fichier, écrite en OBJET dans les 139 fiches. Decap
// tentait de faire tenir l'un dans l'autre, affichait un formulaire
// incohérent, et le commerçant ne pouvait rien y modifier. Personne ne l'a vu
// pendant des mois parce que personne n'avait ouvert ce bloc.
//
// La règle : un champ qu'on ne peut pas modifier dans l'éditeur n'est presque
// jamais un défaut de l'éditeur. C'est un écart entre ce que ce fichier
// déclare et ce que les fichiers contiennent. Ce contrôle le dit à la
// construction, plutôt que six mois plus tard.
// ─────────────────────────────────────────────────────────────────────────

/** La forme JS qu'implique chaque widget Decap. `null` = on ne se prononce pas. */
function formeAttendue(widget) {
  switch (widget) {
    case "list": return "liste";
    case "boolean": return "booleen";
    case "number": return "nombre";
    case "object": return "objet";
    case "string":
    case "text":
    case "markdown":
    case "image":
    case "file":
    case "select":
    case "datetime":
    case "hidden": return "texte";
    default: return null; // widget inconnu ou personnalisé : on n'invente pas
  }
}

function formeReelle(v) {
  if (Array.isArray(v)) return "liste";
  if (v === null) return null;
  switch (typeof v) {
    case "boolean": return "booleen";
    case "number": return "nombre";
    case "string": return "texte";
    case "object": return "objet";
    default: return null;
  }
}

{
  const { readdirSync } = await import("node:fs");
  const { join } = await import("node:path");

  for (const col of collections) {
    // Seules les collections « folder » ont un dossier de fiches à comparer.
    if (!col.folder || !Array.isArray(col.fields)) continue;
    // Les collections en Markdown portent leur corps hors du JSON : hors sujet.
    if (col.format && col.format !== "json") continue;

    let fichiers = [];
    try {
      fichiers = readdirSync(col.folder).filter((f) => f.endsWith(".json"));
    } catch {
      continue; // dossier absent : ce n'est pas à ce script de le signaler
    }

    // ⚠ On agrège par champ AVANT de rapporter. Une divergence touche en
    // général toutes les fiches à la fois : les lister une par une noierait
    // le message dans 139 lignes identiques.
    const ecarts = new Map(); // champ → { attendue, trouvees:Map<forme, [ids]> }

    for (const f of fichiers) {
      let fiche;
      try { fiche = JSON.parse(readFileSync(join(col.folder, f), "utf8")); }
      catch { problemes.push(`${col.folder}/${f} : JSON illisible`); continue; }

      for (const champ of col.fields) {
        if (!champ?.name) continue;
        const attendue = formeAttendue(champ.widget);
        if (!attendue) continue;

        const valeur = fiche[champ.name];

        // ⚠ Une valeur VIDE n'est pas une divergence de forme, quelle que
        // soit son enveloppe : `""`, `{}`, `[]` veulent tous dire « pas
        // renseigné ». Decap et les anciens imports ne s'accordent pas sur
        // celle qu'ils écrivent, et bloquer là-dessus produirait un contrôle
        // qui échoue sur ce que le commerçant fait tous les jours — soit
        // exactement le défaut qui a laissé le site deux jours hors ligne le
        // 2026-09-26. Ce qui compte, c'est une valeur REMPLIE dans la
        // mauvaise forme : c'est elle qui rend le formulaire inutilisable.
        if (valeur === undefined || valeur === null || valeur === "") continue;
        if (typeof valeur === "object" && Object.keys(valeur).length === 0) continue;

        const reelle = formeReelle(valeur);
        if (!reelle || reelle === attendue) continue;

        // Tolérance : un `select` peut légitimement porter un nombre ou un
        // booléen selon les options déclarées. On ne s'en mêle pas.
        if (champ.widget === "select") continue;

        if (!ecarts.has(champ.name)) ecarts.set(champ.name, { attendue, trouvees: new Map() });
        const e = ecarts.get(champ.name);
        if (!e.trouvees.has(reelle)) e.trouvees.set(reelle, []);
        e.trouvees.get(reelle).push(f.replace(/\.json$/, ""));
      }
    }

    for (const [nom, { attendue, trouvees }] of ecarts) {
      for (const [reelle, ids] of trouvees) {
        const exemples = ids.slice(0, 3).join(", ") + (ids.length > 3 ? `, …` : "");
        problemes.push(
          `collection « ${col.name} » › champ « ${nom} » : déclaré en ${attendue}, ` +
            `écrit en ${reelle} dans ${ids.length} fiche(s) (${exemples}).\n` +
            `         → l'éditeur affichera un formulaire incohérent sur ce bloc, et le\n` +
            `           commerçant ne pourra rien y modifier. Convertir les fiches, ou\n` +
            `           changer le widget — mais les deux doivent dire la même chose.`,
        );
      }
    }
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
