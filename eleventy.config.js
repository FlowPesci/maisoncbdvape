/**
 * eleventy.config.js — Configuration Eleventy v3 (ESM).
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

// Cache hash en mémoire pour éviter de relire les fichiers à chaque template
const _hashCache = {};

export default function (eleventyConfig) {
  // ─── Pass-through copy ────────────────────────────────────────────────────
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "admin": "admin" });
  eleventyConfig.addPassthroughCopy({ "src/robots.txt": "robots.txt" });
  eleventyConfig.addPassthroughCopy({ "src/favicon.svg": "favicon.svg" });
  eleventyConfig.addPassthroughCopy({ "src/_headers": "_headers" });
  eleventyConfig.addPassthroughCopy({ "src/_redirects": "_redirects" });

  // ─── Watch targets ────────────────────────────────────────────────────────
  eleventyConfig.addWatchTarget("src/assets/");
  eleventyConfig.addWatchTarget("src/_data/");

  // ─── Filtres Nunjucks ─────────────────────────────────────────────────────
  eleventyConfig.addFilter("eur", (value) => {
    const n = Number(value);
    if (isNaN(n)) return value;
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(n);
  });

  eleventyConfig.addFilter("slug", (str) =>
    String(str)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );

  eleventyConfig.addFilter("dateFr", (value) => {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    return d.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  });

  eleventyConfig.addFilter("limit", (arr, n) => (arr || []).slice(0, n));

  eleventyConfig.addFilter("where", (arr, key, value) =>
    (arr || []).filter((item) => item[key] === value)
  );

  eleventyConfig.addFilter("dump", (value) => JSON.stringify(value, null, 2));

  eleventyConfig.addFilter("includes", (haystack, needle) => {
    if (haystack == null) return false;
    if (Array.isArray(haystack)) return haystack.includes(needle);
    return String(haystack).includes(String(needle));
  });

  eleventyConfig.addFilter("rejectId", (arr, id) =>
    (arr || []).filter((item) => item.id !== id)
  );

  eleventyConfig.addFilter("pluck", (arr, key) =>
    (arr || []).map((item) => item[key])
  );

  eleventyConfig.addFilter("unique", (arr) =>
    Array.from(new Set(arr || []))
  );

  eleventyConfig.addFilter("count", (arr) =>
    Array.isArray(arr) ? arr.length : 0
  );

  eleventyConfig.addFilter("min", (arr) => {
    const nums = (arr || []).map(Number).filter((n) => !isNaN(n));
    return nums.length ? Math.min(...nums) : 0;
  });

  eleventyConfig.addFilter("max", (arr) => {
    const nums = (arr || []).map(Number).filter((n) => !isNaN(n));
    return nums.length ? Math.max(...nums) : 0;
  });

  
  // ISO 8601 date (sitemap) : Date → "2026-04-25"
  eleventyConfig.addFilter("isoDate", (value) => {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    return d.toISOString().slice(0, 10);
  });

// ─── Collections par univers ──────────────────────────────────────────────
  const UNIVERS = ["cbd", "vape", "puffs", "chicha", "accessoires"];
  UNIVERS.forEach((cat) => {
    eleventyConfig.addCollection(cat, (api) => {
      const produits = api.getAll()[0]?.data?.produits || [];
      return produits.filter((p) => p.categorie === cat && p.actif !== false);
    });
  });

  eleventyConfig.addCollection("produitsActifs", (api) => {
    const produits = api.getAll()[0]?.data?.produits || [];
    return produits
      .filter((p) => p.actif !== false)
      .sort((a, b) => new Date(b.dateAjout || 0) - new Date(a.dateAjout || 0));
  });

  eleventyConfig.addCollection("bestsellers", (api) => {
    const produits = api.getAll()[0]?.data?.produits || [];
    return produits.filter(
      (p) => p.actif !== false && (p.tags || []).includes("bestseller")
    );
  });

  eleventyConfig.addShortcode("year", () => `${new Date().getFullYear()}`);

  // ─── Cache busting : hash du contenu du fichier ───────────────────────────
  // Usage dans les templates : /assets/css/tailwind.css?v={{ "/assets/css/tailwind.css" | contentHash }}
  eleventyConfig.addFilter("contentHash", (urlPath) => {
    if (_hashCache[urlPath]) return _hashCache[urlPath];
    try {
      const localPath = join(process.cwd(), "src", urlPath);
      const content = readFileSync(localPath);
      const hash = createHash("md5").update(content).digest("hex").slice(0, 8);
      _hashCache[urlPath] = hash;
      return hash;
    } catch {
      return "dev";
    }
  });

  return {
    dir: {
      input: "src",
      output: "public",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["njk", "md", "html", "11ty.js"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    pathPrefix: "/",
  };
}
