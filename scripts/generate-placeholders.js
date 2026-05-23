/**
 * scripts/generate-placeholders.js
 * ----------------------------------------------------------------------------
 * Génère des SVG placeholders aux couleurs du thème Tabac Gex pour chaque
 * image référencée dans `produits.json` et `categories.json`.
 *
 * Comportement :
 *   1. Parcourt les deux JSON et collecte tous les chemins d'images locaux.
 *   2. Convertit chaque chemin `.jpg` / `.png` / `.webp` en `.svg`.
 *   3. Écrit un SVG (dégradé violet → vert + nom du produit/catégorie).
 *   4. Réécrit les JSON avec les nouveaux chemins .svg.
 *
 * Lancement :
 *   node scripts/generate-placeholders.js
 *
 * Idempotent : peut être relancé sans risque (réécrase les SVG existants).
 * ----------------------------------------------------------------------------
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, "..");

const PRODUITS_JSON   = path.join(ROOT, "src", "data-source", "produits.json");
const CATEGORIES_JSON = path.join(ROOT, "src", "data-source", "categories.json");

// Couleurs Tabac Gex
const NEON_GREEN  = "#39FF14";
const NEON_VIOLET = "#BF5FFF";
const NEON_BLUE   = "#00D4FF";
const DARK_BG     = "#0A0A0F";
const DARK_CARD   = "#12121A";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convertit une URL publique (`/assets/img/...`) en chemin disque local.
 * Saute les URLs externes (https://...) qui ne sont pas à patcher.
 */
function publicToDisk(publicPath) {
  if (!publicPath || /^https?:\/\//i.test(publicPath)) return null;
  // /assets/img/x.jpg  → src/assets/img/x.jpg
  const trimmed = publicPath.replace(/^\//, "");
  return path.join(ROOT, "src", trimmed);
}

/** Remplace l'extension par .svg. */
function toSvgExt(p) {
  return p.replace(/\.(jpe?g|png|webp|gif)$/i, ".svg");
}

/** Découpe un nom long sur 2 lignes max pour le SVG. */
function wrapText(text, maxChars = 22) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > maxChars && current) {
      lines.push(current.trim());
      current = w;
    } else {
      current += " " + w;
    }
    if (lines.length === 2) break;
  }
  if (current && lines.length < 2) lines.push(current.trim());
  return lines.slice(0, 2);
}

/** Échappe les caractères XML dans un texte affiché en SVG. */
function xmlEscape(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Génère un SVG placeholder. accentColor décide si l'accent dominant est
 * vert (CBD), violet (vape/puffs), bleu (chicha) ou neutre.
 */
function buildSvg({ title, subtitle, accentColor, ratio = "card" }) {
  const [w, h] = ratio === "wide" ? [1200, 630] : [800, 800];
  const lines = wrapText(title);
  const titleY = h / 2 + (lines.length === 1 ? 12 : -8);

  const lineEls = lines
    .map(
      (line, i) =>
        `<text x="${w / 2}" y="${titleY + i * 64}" text-anchor="middle" ` +
        `fill="#FFFFFF" font-family="'Bebas Neue', Impact, sans-serif" ` +
        `font-size="56" letter-spacing="2" style="text-transform:uppercase;">` +
        xmlEscape(line) +
        `</text>`
    )
    .join("\n  ");

  const subtitleEl = subtitle
    ? `<text x="${w / 2}" y="${
        titleY + lines.length * 64 + 28
      }" text-anchor="middle" fill="${accentColor}" ` +
      `font-family="'Space Mono', monospace" font-size="14" letter-spacing="6" ` +
      `style="text-transform:uppercase;">` +
      xmlEscape(subtitle) +
      `</text>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${xmlEscape(
    title
  )}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"  stop-color="${DARK_BG}"/>
      <stop offset="50%" stop-color="${DARK_CARD}"/>
      <stop offset="100%" stop-color="${DARK_BG}"/>
    </linearGradient>
    <radialGradient id="accentGlow" cx="50%" cy="40%" r="55%">
      <stop offset="0%"   stop-color="${accentColor}" stop-opacity="0.32"/>
      <stop offset="60%"  stop-color="${accentColor}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${accentColor}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${accentColor}" stroke-opacity="0.06" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
  <rect width="${w}" height="${h}" fill="url(#grid)"/>
  <rect width="${w}" height="${h}" fill="url(#accentGlow)"/>

  <!-- Cadre néon discret -->
  <rect x="24" y="24" width="${w - 48}" height="${h - 48}" rx="16" ry="16"
        fill="none" stroke="${accentColor}" stroke-opacity="0.35" stroke-width="2"/>

  <!-- Mention TABAC GEX en haut à gauche -->
  <text x="48" y="68" fill="${accentColor}"
        font-family="'Space Mono', monospace" font-size="14"
        letter-spacing="6" style="text-transform:uppercase;">// TABAC GEX</text>

  <!-- Indicateur "PLACEHOLDER" en haut à droite -->
  <text x="${w - 48}" y="68" text-anchor="end" fill="#8A8A9A"
        font-family="'Space Mono', monospace" font-size="11"
        letter-spacing="4" style="text-transform:uppercase;">[ image en attente ]</text>

  <!-- Titre central -->
  ${lineEls}

  ${subtitleEl}

  <!-- Bandeau néon en bas -->
  <rect x="0" y="${h - 4}" width="${w}" height="4" fill="${accentColor}"/>
</svg>
`;
}

/**
 * Choisit la couleur d'accent en fonction de la catégorie.
 */
function accentForCategory(slug) {
  switch (slug) {
    case "cbd":         return NEON_GREEN;
    case "vape":        return NEON_VIOLET;
    case "puffs":       return NEON_VIOLET;
    case "chicha":      return NEON_BLUE;
    case "accessoires": return "#8A8A9A";
    default:            return NEON_GREEN;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const produitsRaw = JSON.parse(fs.readFileSync(PRODUITS_JSON, "utf8"));
  const produitsWrapped = !Array.isArray(produitsRaw);
  const produits = produitsWrapped ? produitsRaw.produits : produitsRaw;
  const categoriesRaw = JSON.parse(fs.readFileSync(CATEGORIES_JSON, "utf8"));
  const categoriesWrapped = !Array.isArray(categoriesRaw);
  const categories = categoriesWrapped ? categoriesRaw.categories : categoriesRaw;

  let writtenCount = 0;
  let skippedCount = 0;

  // ── Catégories ─────────────────────────────────────────────────────────────
  for (const cat of categories) {
    const diskPath = publicToDisk(cat.image);
    if (!diskPath) { skippedCount++; continue; }
    const svgDisk = toSvgExt(diskPath);

    const svg = buildSvg({
      title:       cat.nom,
      subtitle:    `Catégorie · ${cat.nomCourt || cat.slug}`,
      accentColor: accentForCategory(cat.slug),
      ratio:       "wide",
    });

    fs.mkdirSync(path.dirname(svgDisk), { recursive: true });
    fs.writeFileSync(svgDisk, svg, "utf8");
    cat.image = toSvgExt(cat.image);
    writtenCount++;
  }

  // ── Produits (image principale + galerie) ──────────────────────────────────
  for (const produit of produits) {
    // Index pour différencier le subtitle de chaque image de galerie
    const allPaths = new Set();
    if (produit.image) allPaths.add(produit.image);
    if (Array.isArray(produit.galerie)) produit.galerie.forEach((p) => allPaths.add(p));

    const ordered = [...allPaths];
    ordered.forEach((publicPath, idx) => {
      const diskPath = publicToDisk(publicPath);
      if (!diskPath) { skippedCount++; return; }
      const svgDisk = toSvgExt(diskPath);

      const svg = buildSvg({
        title:       produit.nom,
        subtitle:    `${produit.marque} · vue ${idx + 1}/${ordered.length}`,
        accentColor: accentForCategory(produit.categorie),
        ratio:       "card",
      });

      fs.mkdirSync(path.dirname(svgDisk), { recursive: true });
      fs.writeFileSync(svgDisk, svg, "utf8");
      writtenCount++;
    });

    // Patch des chemins JSON
    if (produit.image) produit.image = toSvgExt(produit.image);
    if (Array.isArray(produit.galerie))
      produit.galerie = produit.galerie.map(toSvgExt);
  }

  // ── Réécriture des JSON ────────────────────────────────────────────────────
  fs.writeFileSync(
    PRODUITS_JSON,
    JSON.stringify(produitsWrapped ? { produits } : produits, null, 2) + "\n",
    "utf8"
  );
  fs.writeFileSync(
    CATEGORIES_JSON,
    JSON.stringify(categoriesWrapped ? { categories } : categories, null, 2) + "\n",
    "utf8"
  );

  console.log(`✓ ${writtenCount} placeholders SVG générés`);
  console.log(`  ${skippedCount} chemins ignorés (URL externe ou vide)`);
  console.log(`✓ produits.json et categories.json mis à jour avec extensions .svg`);
}

main();
