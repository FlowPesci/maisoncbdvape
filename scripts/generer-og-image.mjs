/**
 * scripts/generer-og-image.mjs
 * Fabrique le visuel de partage (Open Graph) de la marque.
 *
 *   node scripts/generer-og-image.mjs
 *
 * ─── Pourquoi un script, et pas une image déposée à la main ───────────────
 * L'audit du 2026-09-30 a relevé qu'aucune `og:image` n'était servie : un lien
 * partagé sur un réseau, dans une messagerie ou dans un SMS sortait en carte
 * grise, sans visuel. La balise `twitter:card` annonçait pourtant
 * `summary_large_image`, donc une grande image — qui n'existait pas.
 *
 * Le visuel est **dessiné depuis les tokens du site**, pas exporté d'un outil
 * de design : le jour où l'accent doré change dans `tailwind/input.css`, on
 * relance ce script et la carte de partage suit. Une image binaire déposée à
 * la main aurait divergé au premier changement de charte — c'est la doctrine
 * « une seule source de vérité » appliquée à un fichier PNG.
 *
 * ⚠ Les polices sont EMBARQUÉES dans le SVG en data URI, comme dans
 *   `filigraner-medias.mjs`. sharp/rsvg n'a pas accès aux `@font-face` du
 *   site : sans ça, le rendu retombe sur une police système et le visuel ne
 *   ressemble plus à la marque.
 *
 * ⚠ 1200 × 630, et ce n'est pas négociable : c'est le format attendu par les
 *   plateformes. Une autre proportion est recadrée par elles, généralement en
 *   coupant le texte.
 * ─────────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SORTIE = join(ROOT, "src/assets/img/og-maisoncbdvape.png");

const LARGEUR = 1200;
const HAUTEUR = 630;

// ── Tokens, relus dans la feuille source plutôt que recopiés ───────────────
//
// Recopier « #c9a96e » ici, c'est créer la deuxième source de vérité que ce
// projet passe son temps à supprimer. On lit les variables :root.
const css = readFileSync(join(ROOT, "tailwind/input.css"), "utf8");
function token(nom, repli) {
  const m = css.match(new RegExp(`--${nom}\\s*:\\s*(#[0-9a-fA-F]{3,8})`));
  return m ? m[1] : repli;
}
// Le nom, la baseline et l'adresse viennent de `site.json`, comme partout
// ailleurs. Les réécrire ici donnerait une carte de partage qui continue
// d'annoncer l'ancienne baseline le jour où elle change.
const site = JSON.parse(readFileSync(join(ROOT, "src/_data/site.json"), "utf8"));

const DARK = token("dark", "#1a1714");
const DARK2 = token("dark2", "#221e1a");
const CREAM = token("cream", "#f5f0e8");
const GOLD = token("gold", "#c9a96e");
const TEXT = token("text", "#d8d0c4");

const police = (fichier) =>
  readFileSync(join(ROOT, "src/assets/fonts", fichier)).toString("base64");

const BITTER_300 = police("bitter-300-latin.woff2");
const DM_SANS_400 = police("dm-sans-400-latin.woff2");
const DM_SANS_500 = police("dm-sans-500-latin.woff2");

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// « MaisonCBDVape » → « Maison » + « CBDVape ». Le nom se coupe à sa seconde
// majuscule ; si le nom change et n'en a plus, tout reste en crème plutôt que
// de couper au hasard.
const coupure = site.nom.slice(1).search(/[A-Z]/);
const nomDebut = coupure === -1 ? site.nom : site.nom.slice(0, coupure + 1);
const nomFin = coupure === -1 ? "" : site.nom.slice(coupure + 1);

// ── Le dessin ──────────────────────────────────────────────────────────────
//
// Reprend la signature typographique décrite dans l'audit et déjà en place sur
// le site : petit label en capitales encadré de filets, puis titre en serif
// léger avec UN mot en doré.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGEUR}" height="${HAUTEUR}" viewBox="0 0 ${LARGEUR} ${HAUTEUR}">
  <defs>
    <style>
      @font-face { font-family:'OgTitre'; font-weight:300;
        src:url(data:font/woff2;base64,${BITTER_300}) format('woff2'); }
      @font-face { font-family:'OgTexte'; font-weight:400;
        src:url(data:font/woff2;base64,${DM_SANS_400}) format('woff2'); }
      @font-face { font-family:'OgLabel'; font-weight:500;
        src:url(data:font/woff2;base64,${DM_SANS_500}) format('woff2'); }
    </style>
    <linearGradient id="fond" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${DARK}"/>
      <stop offset="100%" stop-color="${DARK2}"/>
    </linearGradient>
  </defs>

  <rect width="${LARGEUR}" height="${HAUTEUR}" fill="url(#fond)"/>

  <!-- Filet doré en haut : le même repère que le header du site -->
  <rect x="0" y="0" width="${LARGEUR}" height="4" fill="${GOLD}"/>

  <!-- Label encadré de filets -->
  <line x1="100" y1="196" x2="152" y2="196" stroke="${GOLD}" stroke-width="1"/>
  <text x="168" y="202" font-family="'OgLabel',sans-serif" font-weight="500"
        font-size="20" letter-spacing="5" fill="${GOLD}">${esc(`BOUTIQUE À ${site.adresse.ville.toUpperCase()} · ${site.adresse.codePostal}`)}</text>

  <!-- Nom de la marque, un mot en doré : même signature que les titres du
       site, où un mot du titre passe en doré. Le découpage suit la casse
       interne du nom plutôt qu'une coupure écrite à la main. -->
  <text x="100" y="312" font-family="'OgTitre',Georgia,serif" font-weight="300"
        font-size="86" fill="${CREAM}">${esc(nomDebut)}<tspan fill="${GOLD}">${esc(nomFin)}</tspan></text>

  <!-- Baseline -->
  <text x="100" y="376" font-family="'OgTitre',Georgia,serif" font-weight="300"
        font-size="34" fill="${TEXT}">${esc(site.tagline.replace(/'/g, "’"))}</text>

  <line x1="100" y1="432" x2="340" y2="432" stroke="${GOLD}" stroke-width="1" opacity="0.55"/>

  <!-- Arguments factuels. Volontairement descriptifs : la publicité pour les
       produits du vapotage est interdite (CSP art. L3513-4), et ce visuel est
       exactement ce qui s'affiche quand un lien est partagé. Aucun slogan,
       aucune promotion, aucun prix. -->
  <text x="100" y="492" font-family="'OgTexte',sans-serif" font-weight="400"
        font-size="26" fill="${TEXT}">${esc("CBD · Vape · Articles fumeurs")}</text>
  <text x="100" y="536" font-family="'OgTexte',sans-serif" font-weight="400"
        font-size="26" fill="${TEXT}">${esc("Retrait en 1 h à Gex · Livraison 48 h")}</text>
</svg>`;

if (!existsSync(dirname(SORTIE))) mkdirSync(dirname(SORTIE), { recursive: true });

// ⚠ `density: 72` et pas 96. sharp rend le SVG à la densité demandée en
//   partant d'une base de 72 ppp : à 96, le viewBox de 1200 sort en 1600 px.
//   Le contrôle de dimensions en fin de script est né de cette erreur.
const png = await sharp(Buffer.from(svg), { density: 72 })
  .png({ compressionLevel: 9, palette: true })
  .toBuffer();

writeFileSync(SORTIE, png);

const meta = await sharp(png).metadata();
const ko = (png.length / 1024).toFixed(0);

if (meta.width !== LARGEUR || meta.height !== HAUTEUR) {
  console.error(`[og] ✕ dimensions inattendues : ${meta.width}×${meta.height}`);
  process.exit(1);
}

console.log(`[og] ✓ ${SORTIE.replace(ROOT + "/", "")} — ${meta.width}×${meta.height}, ${ko} Ko`);
