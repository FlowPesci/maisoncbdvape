/**
 * scripts/verifier-cache-assets.mjs
 * Tout script servi depuis /assets/ doit porter une empreinte de contenu.
 *
 *   node scripts/verifier-cache-assets.mjs   → échoue s'il en manque une
 *
 * ─── Pourquoi ce contrôle existe ──────────────────────────────────────────
 * `src/_headers` met tout `/assets/*` en cache **un an, en `immutable`** :
 *
 *     /assets/*
 *       Cache-Control: public, max-age=31536000, immutable
 *
 * `immutable` dit au navigateur de ne même pas revalider. Un fichier servi
 * sous la même URL n'est donc plus jamais rechargé — ni par le visiteur, ni
 * par le CDN de Cloudflare.
 *
 * La feuille de style s'en sortait, appelée avec `?v={{ … | contentHash }}`.
 * Dix-neuf scripts, non. Résultat mesuré le 2026-09-04 sur la production :
 * `rail-onglets.js` était servi en 3 328 octets alors que le dépôt en
 * contenait 6 059, `cf-cache-status: HIT` — la version déployée le matin même
 * n'atteignait personne. Le même piège valait pour `header.js`,
 * `admin-stocks.js`, `produit-detail-achat.js` : **toute correction de
 * JavaScript pouvait rester invisible pendant un an** sur les navigateurs
 * ayant déjà visité le site.
 *
 * C'est le pire genre de défaut : le code est juste, le déploiement réussit,
 * les contrôles passent, et rien ne change à l'écran. On cherche alors la
 * panne dans le code qu'on vient d'écrire.
 *
 * ⚠ Ne pas « régler » le problème en assouplissant `_headers`. Le cache long
 * est correct et précieux ; c'est l'URL qui doit changer avec le contenu.
 *
 * Les polices sont hors périmètre : leur nom porte déjà la graisse et le
 * sous-ensemble, et un changement de fonte change le nom de fichier.
 * `admin/` aussi : recopié tel quel, les filtres Nunjucks n'y sont pas
 * évalués — un `{{ … }}` y serait servi littéralement.
 * ─────────────────────────────────────────────────────────────────────────── */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const RACINE = "src";
const MOTIF = /(?:src|href)="(\/assets\/(?:js|css)\/[^"]+)"/g;

function gabarits(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { out.push(...gabarits(p)); continue; }
    if (extname(p) === ".njk") out.push(p);
  }
  return out;
}

const manquants = [];
let total = 0;

for (const f of gabarits(RACINE)) {
  const texte = readFileSync(f, "utf8");
  for (const m of texte.matchAll(MOTIF)) {
    total++;
    if (!m[1].includes("?v=")) {
      manquants.push({ fichier: relative(RACINE, f), url: m[1] });
    }
  }
}

console.log(`\nEmpreintes de cache — ${total} référence(s) à /assets/js et /assets/css\n`);

if (!manquants.length) {
  console.log(`✓ Toutes portent une empreinte de contenu.\n`);
  process.exit(0);
}

console.error(`✗ ${manquants.length} référence(s) sans empreinte :\n`);
for (const { fichier, url } of manquants) {
  console.error(`    ${fichier}`);
  console.error(`      ${url}`);
}
console.error(`
  Servis en cache un an et « immutable », ces fichiers ne seront jamais
  rechargés par un navigateur déjà venu : la correction que vous venez
  d'écrire n'atteindra personne.

  Ajouter l'empreinte :

    src="/assets/js/exemple.js?v={{ '/assets/js/exemple.js' | contentHash }}"
`);
process.exit(1);
