/**
 * scripts/build-csp.mjs
 * Calcule la ligne Content-Security-Policy et l'écrit dans public/_headers.
 *
 * ─── Pourquoi ce script existe ────────────────────────────────────────────
 * La CSP contenait 'unsafe-inline' et 'unsafe-eval' sur script-src : une
 * injection de script y trouvait une porte grande ouverte (voir CLAUDE.md,
 * chantiers de sécurité). Le site est statique — pas de nonce possible, un
 * nonce exige une valeur différente à chaque requête, donc un serveur qui
 * réécrit chaque réponse. La seule voie qui laisse le site statique est le
 * hash : le contenu d'un script en ligne ne change pas d'une génération à
 * l'autre, on peut donc l'empreinter une fois pour toutes au build.
 *
 * Les gestionnaires `onclick="..."` et la plupart des `<script>` ont été
 * sortis en fichiers externes (src/assets/js/) pendant ce chantier. Il reste
 * volontairement quelques scripts en ligne, là où l'ordre d'exécution compte
 * réellement (le portail d'âge, qui doit s'exécuter avant la première
 * peinture pour ne jamais laisser voir la page dessous) — ce script les
 * empreinte plutôt que les déplacer.
 *
 * Les blocs `application/ld+json`, `application/json` et assimilés ne sont
 * pas concernés : un navigateur ne les « prépare » jamais comme un script
 * exécutable (le type n'est pas JavaScript), donc script-src ne les régit
 * pas — vérifié empiriquement, pas supposé.
 *
 *   node scripts/build-csp.mjs
 *
 * Lancé par `npm run build`, après `eleventy` : il lui faut le HTML généré
 * dans public/.
 * ─────────────────────────────────────────────────────────────────────────── */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { createHash } from "node:crypto";

const PUBLIC = "public";
const HEADERS = join(PUBLIC, "_headers");

// Au-delà, quelque chose a dérivé (un script templé par produit, par
// exemple) : mieux vaut arrêter le build que laisser grossir l'en-tête en
// silence.
const MAX_HASHES = 15;

const TYPES_NON_EXECUTABLES = new Set([
  "application/ld+json",
  "application/json",
  "text/template",
]);

function fichiers(dossier, extensions, acc = []) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) fichiers(chemin, extensions, acc);
    else if (extensions.includes(extname(nom))) acc.push(chemin);
  }
  return acc;
}

const scriptRe = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
const hashes = new Map(); // hash base64 -> { count, exemple }

for (const f of fichiers(PUBLIC, [".html"])) {
  const html = readFileSync(f, "utf8");
  for (const m of html.matchAll(scriptRe)) {
    const attrs = m[1] || "";
    const type = (attrs.match(/type="([^"]+)"/) || [])[1] || "text/javascript";
    if (TYPES_NON_EXECUTABLES.has(type)) continue;
    const body = m[2];
    if (!body.trim()) continue; // <script src=…> capturé par erreur, ou bloc vide
    const hash = createHash("sha256").update(body, "utf8").digest("base64");
    const entry = hashes.get(hash) || { count: 0, exemple: f };
    entry.count += 1;
    hashes.set(hash, entry);
  }
}

if (hashes.size > MAX_HASHES) {
  console.error(
    `[csp] ✕ ${hashes.size} scripts en ligne distincts, au-delà du seuil (${MAX_HASHES}).`
  );
  console.error("       Un script templé par page (produit, commande…) a probablement");
  console.error("       été réintroduit en ligne. Le sortir vers src/assets/js/ plutôt");
  console.error("       que de relever ce seuil.");
  process.exit(1);
}

const hashSources = [...hashes.keys()].map((h) => `'sha256-${h}'`);

const CSP_GLOBALE =
  "default-src 'self'; " +
  `script-src 'self' ${hashSources.join(" ")} https://unpkg.com https://identity.netlify.com https://widget.mondialrelay.com; ` +
  "style-src 'self' 'unsafe-inline' https://unpkg.com https://widget.mondialrelay.com; " +
  "font-src 'self' https://unpkg.com data:; " +
  "img-src 'self' data: blob: https:; " +
  "connect-src 'self' https://api.github.com https://github.com https://api.resend.com https://widget.mondialrelay.com https://unpkg.com; " +
  "worker-src 'self' blob:; " +
  "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; " +
  "form-action 'self' https://p.monetico-services.com;";

// Decap CMS (unpkg.com/decap-cms) évalue sa configuration via une chaîne —
// EvalError confirmé en local sans cette exception. Réservée à son propre
// chemin plutôt qu'accordée au site entier.
const CSP_CONTENU =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-eval' https://unpkg.com https://identity.netlify.com https://widget.mondialrelay.com; " +
  "style-src 'self' 'unsafe-inline' https://unpkg.com https://widget.mondialrelay.com; " +
  "font-src 'self' https://unpkg.com data:; " +
  "img-src 'self' data: blob: https:; " +
  "connect-src 'self' https://api.github.com https://github.com https://api.resend.com https://widget.mondialrelay.com https://unpkg.com; " +
  "worker-src 'self' blob:; " +
  "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; " +
  "form-action 'self' https://p.monetico-services.com;";

let headers = readFileSync(HEADERS, "utf8");

// Insère la ligne globale dans le bloc /* existant, juste après la dernière
// ligne de son en-tête (Cross-Origin-Resource-Policy).
const marqueur = "Cross-Origin-Resource-Policy: same-site";
if (!headers.includes(marqueur)) {
  throw new Error(`[csp] Repère "${marqueur}" introuvable dans ${HEADERS}`);
}
headers = headers.replace(
  marqueur,
  `${marqueur}\n  Content-Security-Policy: ${CSP_GLOBALE}`
);

headers += `\n/admin/contenu/*\n  Content-Security-Policy: ${CSP_CONTENU}\n`;

writeFileSync(HEADERS, headers, "utf-8");

console.log(
  `[csp] ✓ script-src sans 'unsafe-inline' ni 'unsafe-eval' — ${hashes.size} script(s) en ligne empreinté(s)\n` +
  `      /admin/contenu/* garde 'unsafe-eval' (Decap CMS)`
);
