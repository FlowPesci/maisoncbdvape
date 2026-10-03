/**
 * scripts/verifier-lock.mjs
 * `package.json` et `package-lock.json` doivent rester synchronisés.
 *
 *   node scripts/verifier-lock.mjs
 *
 * ─── Pourquoi ce contrôle existe ──────────────────────────────────────────
 * Le 2026-10-03, j'ai monté `wrangler` de `^4.94.0` à `^4.147.0` dans
 * `package.json` sans régénérer le lock. En local, rien ne l'a signalé : `npm
 * install` aurait corrigé le lock, et je ne l'ai pas lancé. Le déploiement
 * suivant est tombé.
 *
 * Cloudflare installe avec **`npm clean-install`** (`npm ci`), et `npm ci`
 * refuse par conception de réconcilier quoi que ce soit :
 *
 *   npm error `npm ci` can only install packages when your package.json and
 *   package-lock.json are in sync.
 *   npm error Invalid: lock file's wrangler@4.94.0 does not satisfy
 *             wrangler@4.147.0
 *
 * ⚠ **Une seule ligne changée a produit soixante lignes d'erreur.** Le reste
 *   — esbuild, miniflare, workerd, les paquets de plateforme de sharp — n'est
 *   que l'arbre de dépendances de la version demandée, comparé à celui du
 *   lock. Lire la PREMIÈRE ligne `Invalid:` suffit : les autres en découlent.
 *
 * ⚠ **Et la boutique était éteinte, pas seulement mon commit.** `main` ne se
 *   construisait plus : l'enregistrement d'une fiche par le commerçant depuis
 *   `/admin/contenu/` aurait échoué de la même façon, sans qu'il comprenne
 *   pourquoi. C'est exactement le scénario que `verify:redaction` a déjà
 *   coûté deux jours.
 *
 * Ce contrôle est **bloquant**, et il respecte la règle du projet : il ne se
 * déclenche que sur ce que le CODE peut casser. Le commerçant ne touche jamais
 * à `package.json` ; seul un développeur peut créer cet écart.
 *
 * ⚠ Il ne remplace pas `npm install` : il dit qu'il manque, pas comment
 *   réparer. La réparation est toujours `npm install` puis **commiter le lock**.
 * ─────────────────────────────────────────────────────────────────────────── */

import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));

if (lock.lockfileVersion < 2 || !lock.packages) {
  console.log("[lock] ⚠ lockfile v1 : contrôle impossible, ignoré.");
  process.exit(0);
}

/**
 * Le range est-il satisfait par la version du lock ?
 *
 * ⚠ On ne traite QUE les formes que ce dépôt emploie — `^x.y.z`, `~x.y.z` et
 *   l'exact. Tout le reste (`*`, `>=`, `git+…`, `workspace:`) est ignoré plutôt
 *   que mal interprété : un contrôle qui invente une règle bloque à tort, et un
 *   contrôle qui bloque à tort finit désactivé. C'est la même prudence que les
 *   widgets inconnus de `verify:cms`.
 */
function satisfait(range, version) {
  if (!range || !version) return true;
  const m = /^([\^~]?)(\d+)\.(\d+)\.(\d+)/.exec(String(range).trim());
  const v = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version).trim());
  if (!m || !v) return true;                       // forme non gérée : on se tait

  const [, op, rMaj, rMin, rPat] = m.map((x, i) => (i > 1 ? Number(x) : x));
  const [, vMaj, vMin, vPat] = v.map((x, i) => (i > 0 ? Number(x) : x));

  if (op === "^") {
    if (vMaj !== rMaj) return false;
    if (vMin !== rMin) return vMin > rMin;
    return vPat >= rPat;
  }
  if (op === "~") {
    if (vMaj !== rMaj || vMin !== rMin) return false;
    return vPat >= rPat;
  }
  return vMaj === rMaj && vMin === rMin && vPat === rPat;
}

const ecarts = [];
const sections = ["dependencies", "devDependencies", "optionalDependencies"];

for (const section of sections) {
  for (const [nom, range] of Object.entries(pkg[section] || {})) {
    const entree = lock.packages[`node_modules/${nom}`];
    if (!entree) {
      ecarts.push(`${nom} — déclaré en « ${range} », ABSENT du lock`);
      continue;
    }
    if (!satisfait(range, entree.version)) {
      ecarts.push(`${nom} — package.json veut « ${range} », le lock a ${entree.version}`);
    }
  }
}

// Le lock doit aussi décrire le paquet racine avec les mêmes dépendances.
const racine = lock.packages[""];
if (racine) {
  for (const section of sections) {
    for (const [nom, range] of Object.entries(pkg[section] || {})) {
      const inscrit = (racine[section] || {})[nom];
      if (inscrit !== undefined && inscrit !== range) {
        ecarts.push(`${nom} — le lock mémorise « ${inscrit} » là où package.json dit « ${range} »`);
      }
    }
  }
}

if (ecarts.length) {
  console.error(`\n[lock] ✕ package.json et package-lock.json ont divergé (${ecarts.length}) :\n`);
  for (const e of ecarts) console.error(`       · ${e}`);
  console.error("");
  console.error("       Cloudflare installe avec `npm ci`, qui REFUSE de réconcilier.");
  console.error("       La construction échouera, et avec elle tout enregistrement de");
  console.error("       fiche par le commerçant — pas seulement votre commit.");
  console.error("");
  console.error("       Réparer :  npm install   puis COMMITER package-lock.json");
  console.error("");
  process.exit(1);
}

console.log("[lock] ✓ package.json et package-lock.json sont synchronisés");
