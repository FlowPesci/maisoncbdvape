/**
 * eleventy.config.js — Configuration Eleventy v3 (ESM).
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { drapeauOrigine, libelleOrigine } from "./scripts/origines.mjs";

// Cache hash en mémoire pour éviter de relire les fichiers à chaque template
const _hashCache = {};

// Catégories ouvertes à la vente — source unique pour les collections
const _cats = JSON.parse(readFileSync("src/data-source/categories.json", "utf8"));
const categoriesActives = (Array.isArray(_cats) ? _cats : _cats.categories || [])
  .filter((c) => c.actif !== false);

export default function (eleventyConfig) {
  // ─── Pass-through copy ────────────────────────────────────────────────────
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "admin": "admin" });
  eleventyConfig.addPassthroughCopy({ "src/favicon.svg": "favicon.svg" });
  eleventyConfig.addPassthroughCopy({ "src/site.webmanifest": "site.webmanifest" });
  eleventyConfig.addPassthroughCopy({ "src/_headers": "_headers" });
  eleventyConfig.addPassthroughCopy({ "src/_redirects": "_redirects" });

  // ─── Watch targets ────────────────────────────────────────────────────────
  eleventyConfig.addWatchTarget("src/assets/");
  eleventyConfig.addWatchTarget("src/_data/");
  // Les fiches produits/catégories sont lues par src/_data/*.js mais vivent
  // ailleurs : sans ce watch, `npm start` ne voit pas leurs modifications et
  // continue de servir l'ancien catalogue.
  eleventyConfig.addWatchTarget("src/data-source/");

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

  /**
   * Titre de page — la marque n'apparaît qu'UNE fois.
   *
   * L'audit du 2026-09-30 a relevé la duplication sur l'accueil. Le front
   * matter a été corrigé, mais la construction qui a suivi en a montré une
   * autre, invisible de l'extérieur : « Al Fakher Crown Bar Hyper Max Prime
   * 50K | MaisonCBDVape | MaisonCBDVape ». Les 8 fiches qui portent un
   * `seo.title` écrivent TOUTES la marque dedans — elles ont été rédigées
   * avant que `head.njk` l'ajoute.
   *
   * ⚠ Corriger ces 8 fiches n'aurait rien réglé : le champ « Titre SEO » est
   *   libre dans l'éditeur de contenu, et écrire « Mon produit |
   *   MaisonCBDVape » est le réflexe de tous ceux qui ont déjà rempli ce
   *   genre de champ. Le défaut serait revenu à la première fiche suivante,
   *   et personne ne relit les balises `<title>`.
   *
   *   D'où un filtre : le suffixe est retiré s'il est là, puis ajouté une
   *   fois. Le commerçant peut l'écrire ou non, le résultat est le même.
   *
   * Accepte les trois séparateurs qu'on trouve dans ces champs — « | », « – »
   * (demi-cadratin) et « - ». La comparaison ignore la casse : « maisoncbdvape »
   * doit être reconnu autant que « MaisonCBDVape ».
   */
  eleventyConfig.addFilter("titrePage", (titre, nomSite, tagline) => {
    const marque = String(nomSite || "");
    let t = String(titre || "").trim();

    // Retire le suffixe autant de fois qu'il est présent : un champ recopié
    // deux fois donnerait sinon « … | Marque » au lieu d'un titre propre.
    const suffixe = new RegExp(
      `\\s*[|\\u2013\\u2014-]\\s*${marque.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
      "i",
    );
    while (marque && suffixe.test(t)) t = t.replace(suffixe, "").trim();

    // Sans titre de page, on retombe sur marque + baseline : c'est le seul
    // endroit où la baseline a sa place dans un <title>.
    if (!t) return tagline ? `${marque} | ${tagline}` : marque;
    return `${t} | ${marque}`;
  });

  /**
   * Origine géographique — drapeau et libellé.
   *
   * ⚠ Passer par ces filtres, jamais écrire un drapeau dans un gabarit : la
   * carte CBD en portait cinq en dur, qui contredisaient les fiches produits.
   * Voir `scripts/origines.mjs` pour la règle et la raison.
   */
  eleventyConfig.addFilter("drapeau", (origine) => drapeauOrigine(origine));
  eleventyConfig.addFilter("origineLisible", (origine) => libelleOrigine(origine));

  /**
   * Mise en avant sur la carte CBD. Les deux filtres sont complémentaires :
   * une vedette est affichée en tête et NE DOIT PAS reparaître dans la liste
   * de son panneau, sans quoi le même produit figure deux fois.
   *
   * ⚠ Nunjucks n'a pas d'opérateur séquence : filtrer dans une boucle avec
   * `{% set liste = (liste.push(x), liste) %}` ne fonctionne pas ici. D'où
   * ces deux filtres plutôt qu'une construction dans le gabarit.
   */
  eleventyConfig.addFilter("vedettes", (arr) =>
    (arr || []).filter((item) => item.carteVedette === true)
  );
  eleventyConfig.addFilter("sansVedettes", (arr) =>
    (arr || []).filter((item) => item.carteVedette !== true)
  );

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

  /**
   * Normalise une fiche technique en couples [libellé, valeur].
   *
   * ⚠ Ce filtre existe parce que le champ a deux formes selon qui l'écrit :
   *   · à la main dans le JSON  → { "Capacité": "4,5 ml" }
   *   · via Decap CMS           → [ { cle: "Capacité", valeur: "4,5 ml" } ]
   *
   * Le gabarit ne connaissait que la première. Une fiche technique remplie
   * depuis l'éditeur de contenu s'affichait donc en lignes vides — sans
   * erreur, sans avertissement. Personne ne l'avait vu parce qu'aucun des
   * 121 produits n'avait jamais rempli ce champ.
   */
  eleventyConfig.addFilter("paires", (valeur) => {
    if (!valeur) return [];
    if (Array.isArray(valeur)) {
      return valeur
        .map((l) => [l?.cle ?? l?.label ?? "", l?.valeur ?? l?.value ?? ""])
        .filter(([c]) => c);
    }
    return Object.entries(valeur);
  });

  /**
   * La valeur d'UNE caractéristique, par son libellé.
   *
   * ⚠ Ne jamais écrire `produit.ficheTechnique["Taux de CBD"]` dans un
   * gabarit. La carte CBD le faisait, à cinq endroits, et cette lecture ne
   * fonctionne que sur la forme objet. Le 2026-09-28 les 117 fiches sont
   * passées en liste de paires — la seule forme que l'éditeur de contenu
   * sache écrire — et ces cinq colonnes seraient toutes retombées sur « — »
   * sans la moindre erreur.
   *
   * La comparaison ignore casse et espaces : « Taux de CBD » saisi par le
   * commerçant avec une majuscule de plus ne doit pas vider la colonne.
   */
  eleventyConfig.addFilter("valeurFiche", (fiche, cle) => {
    const cherche = String(cle || "").trim().toLowerCase();
    if (!fiche || !cherche) return "";
    const lignes = Array.isArray(fiche)
      ? fiche.map((l) => [l?.cle ?? l?.label ?? "", l?.valeur ?? l?.value ?? ""])
      : Object.entries(fiche);
    const trouve = lignes.find(([c]) => String(c).trim().toLowerCase() === cherche);
    return trouve ? trouve[1] : "";
  });

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
  // Dérivé de categories.json plutôt qu'écrit en dur : retirer ou ajouter une
  // catégorie ne demande aucune modification ici.
  const UNIVERS = categoriesActives.map((c) => c.slug);
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
