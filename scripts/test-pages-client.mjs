/**
 * scripts/test-pages-client.mjs — `npm run test:pages`
 *
 * Exécute les scripts d'une page CLIENT dans le vrai HTML généré, et échoue
 * si l'un d'eux lève. Rien d'autre : pas d'assertion sur le contenu.
 *
 * ─── Pourquoi ce test existe ──────────────────────────────────────────────
 * Le 2026-09-28, le commerçant a signalé qu'un produit n'apparaissait pas
 * dans la catégorie CBD. Le HTML servi le contenait pourtant, à sa place
 * alphabétique — j'ai vérifié la page déployée avant de conclure, et j'ai
 * d'abord eu tort de lui dire qu'il n'y avait rien.
 *
 * La carte était là, avec `opacity: 0`. `categorie-menu.js` levait une
 * **ReferenceError** dès son initialisation :
 *
 *     Cannot access 'brandChecks' before initialization
 *
 * `updateSlider()` (le premier rendu du curseur de prix) appelait
 * `applyFilters()`, qui lit `brandChecks` — déclaré en `const` trois lignes
 * plus bas. Zone morte temporelle : la variable existe, mais y accéder avant
 * sa déclaration jette. Toute la suite de la fonction anonyme est alors
 * abandonnée, **y compris l'IntersectionObserver qui retire l'opacité des
 * cartes**. Les produits restaient invisibles, sans message, sans erreur
 * visible à l'œil — et le catalogue paraissait amputé.
 *
 * C'est exactement la famille de défaut qui a figé `/admin/commandes/` sur
 * « Chargement… ». `CLAUDE.md` notait alors que seul le fait d'ouvrir l'écran
 * l'attrapait, et que ça ne valait que pour le back-office. C'était faux : la
 * même erreur peut vider une page de vente. D'où ce test, qui étend au
 * parcours client la technique déjà éprouvée par `test:diagnostic`.
 *
 * ⚠ Ce qu'il ne voit PAS : une carte affichée mais mal alignée, une couleur,
 * un texte tronqué. Il ne remplace pas l'ouverture dans un navigateur — il
 * garantit seulement qu'aucun script ne meurt au chargement.
 *
 * ⚠ Dépend de `linkedom`. Absent, le test se déclare ignoré plutôt que de
 * faire tomber une construction pour une dépendance de confort.
 * ──────────────────────────────────────────────────────────────────────── */

import { readFileSync, existsSync } from "node:fs";

/** Les pages à couvrir, avec les scripts qu'elles chargent vraiment. */
const PAGES = [
  {
    nom: "catégorie CBD",
    html: "public/categories/cbd/index.html",
    scripts: ["src/assets/js/categorie-menu.js", "src/assets/js/tabacgex.js"],
  },
  {
    nom: "fiche produit",
    html: "public/produits/moon-rock-cbd-indoor/index.html",
    scripts: ["src/assets/js/tabacgex.js"],
  },
  // ⚠ Le back-office compte comme une page rendue, et c'est là que les
  //   défauts survivent le plus longtemps : hors du parcours client, donc
  //   hors de la passe visuelle. `/admin/commandes/` est resté figé sur
  //   « Chargement… » pendant des jours pour exactement cette raison.
  //   L'ordre des scripts compte : `admin-nav.js` définit `window.MCV_ADMIN`,
  //   que `admin-commandes.js` appelle dès son chargement.
  {
    nom: "back-office commandes",
    html: "public/admin/commandes/index.html",
    scripts: ["src/assets/js/admin-nav.js", "src/assets/js/admin-commandes.js"],
  },
];

let parseHTML;
try {
  ({ parseHTML } = await import("linkedom"));
} catch {
  console.log("[pages] ⊘ linkedom absent — test ignoré (npm i -D linkedom pour l'activer)");
  process.exit(0);
}

const echecs = [];
let executes = 0;

for (const page of PAGES) {
  if (!existsSync(page.html)) {
    console.error(`[pages] ✕ ${page.html} introuvable — lancer \`npx eleventy\` d'abord`);
    process.exit(1);
  }

  const { window } = parseHTML(readFileSync(page.html, "utf8"));

  // ⚠ linkedom ne fournit ni IntersectionObserver ni matchMedia. On les
  //   simule au minimum : sans eux, le script échouerait pour une raison qui
  //   n'existe pas dans un vrai navigateur, et le test crierait au loup.
  //   L'observateur ne déclenche rien — on ne teste pas l'animation, on teste
  //   que le script va jusqu'au bout.
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  // ⚠ linkedom expose une `location` incomplète : `hash`, `search` et
  //   `pathname` peuvent manquer. Les compléter, sinon le test accuse un
  //   script parfaitement valide — c'est arrivé à l'écriture même de ce
  //   fichier, sur `tabacgex.js`.
  window.location = Object.assign(
    { href: "https://maisoncbdvape.fr/", hash: "", search: "", pathname: "/", origin: "https://maisoncbdvape.fr" },
    window.location || {},
  );
  if (!window.location.hash) window.location.hash = "";
  if (!window.location.search) window.location.search = "";
  window.scrollTo = () => {};
  window.confirm = () => false;
  window.alert = () => {};
  // linkedom n'expose pas `document.cookie`. `admin-nav.js` le lit pour
  // savoir si la session existe : sans ce complément, le test accuse un
  // script correct — deuxième fausse alerte de ce simulateur, après
  // `location.hash`. D'où l'avertissement en tête de fichier.
  if (typeof window.document.cookie !== "string") {
    let jar = "";
    Object.defineProperty(window.document, "cookie", {
      configurable: true,
      get: () => jar,
      set: (v) => { jar = String(v); },
    });
  }
  window.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" });
  window.localStorage = {
    _d: new Map(),
    getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
    setItem(k, v) { this._d.set(k, String(v)); },
    removeItem(k) { this._d.delete(k); },
  };

  for (const chemin of page.scripts) {
    if (!existsSync(chemin)) {
      echecs.push({ page: page.nom, script: chemin, message: "fichier introuvable" });
      continue;
    }
    const source = readFileSync(chemin, "utf8");
    executes++;
    try {
      // Même contexte pour tous les scripts d'une page : ils partagent le DOM,
      // comme dans un navigateur.
      const fn = new Function(
        "window", "document", "location", "localStorage", "fetch",
        "IntersectionObserver", "matchMedia", "console",
        source,
      );
      fn(
        window, window.document, window.location, window.localStorage, window.fetch,
        window.IntersectionObserver, window.matchMedia, console,
      );
    } catch (err) {
      echecs.push({ page: page.nom, script: chemin, message: `${err.name}: ${err.message}` });
    }
  }
}

if (echecs.length) {
  console.error(`\n[pages] ✕ ${echecs.length} script(s) meurent au chargement :\n`);
  for (const e of echecs) {
    console.error(`       · ${e.page} — ${e.script}`);
    console.error(`         ${e.message}`);
  }
  console.error("");
  console.error("       Un script qui lève à l'initialisation abandonne TOUT ce qui suit");
  console.error("       dans sa fonction anonyme. La page s'affiche, le HTML est complet,");
  console.error("       et pourtant des éléments restent invisibles ou inertes — sans");
  console.error("       message. Ouvrir la console du navigateur : elle nomme la cause.");
  process.exit(1);
}

console.log(`[pages] ✓ ${executes} script(s) exécutés sur ${PAGES.length} pages, aucun n'a levé`);
