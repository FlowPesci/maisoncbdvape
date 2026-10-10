/**
 * verifier-sitemap.mjs — le sitemap annonce-t-il toutes les pages construites ?
 *
 * ⚠ POURQUOI CE SCRIPT EXISTE
 *
 * Le 2026-10-10, `sitemap.njk` est passé d'une liste écrite à la main à une
 * boucle unique sur `collections.all` — chaque page décide d'y entrer. Le
 * gain était réel (/contact/ y manquait depuis toujours), mais la bascule a
 * coûté **150 URL** sans le moindre message :
 *
 *   Eleventy n'inscrit dans les collections que la PREMIÈRE page d'un gabarit
 *   paginé, sauf `addAllPagesToCollections: true`.
 *
 * Les 109 fiches produits, les 4 catégories et les 20 sous-catégories sont
 * toutes paginées. Le sitemap servi annonçait donc 12 URL au lieu de 162 :
 * un produit, deux catégories. Les pages existaient sur le disque, le
 * déploiement était vert, les douze `verify:` au vert, et le catalogue entier
 * était invisible de Google.
 *
 * C'est la panne la plus silencieuse possible : rien ne tombe, rien ne
 * s'affiche de travers, et on ne le voit qu'en COMPTANT les lignes du fichier
 * produit. Je l'ai vu par hasard, en vérifiant un chiffre que j'avais annoncé.
 *
 * ⚠ CE QU'IL COMPARE, ET POURQUOI IL PEUT BLOQUER
 *
 * Les pages HTML réellement écrites dans `public/` ↔ les `<loc>` du sitemap.
 * Les deux sortent de la MÊME construction : le commerçant qui ajoute une
 * fiche fait monter les deux côtés ensemble. Un écart ne peut donc venir que
 * du CODE — un `addAllPagesToCollections` oublié sur un nouveau gabarit
 * paginé, un `eleventyExcludeFromCollections` posé sans y penser. C'est la
 * règle du projet (« ne bloquer que ce que le CODE peut casser ») : il bloque.
 *
 * ⚠ Les exclusions sont LUES, jamais redéduites. Un `sitemap: false` dans le
 * front matter d'une page est une décision ; la réécrire ici en dur ferait
 * exactement ce que la première version de `db:comparer` a fait — inventer un
 * écart au lieu de le constater. Le script relève donc les pages absentes du
 * sitemap, et n'accepte que celles dont le gabarit porte `sitemap: false`.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RACINE = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PUBLIC = join(RACINE, "public");
const SRC = join(RACINE, "src");

/** `/admin/` n'a rien à faire dans un sitemap public, et n'y a jamais été. */
const HORS_PERIMETRE = [/^\/admin\//, /^\/404\/?$/];

function pagesConstruites(dir, acc = []) {
  for (const nom of readdirSync(dir)) {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) {
      pagesConstruites(chemin, acc);
    } else if (nom === "index.html") {
      const url = "/" + relative(PUBLIC, chemin).split(sep).slice(0, -1).join("/");
      acc.push(url === "/" ? "/" : url + "/");
    }
  }
  return acc;
}

/**
 * Les gabarits qui déclarent `sitemap: false`.
 *
 * On lit le front matter, pas le HTML produit : c'est là que la décision est
 * écrite, avec sa raison en commentaire juste au-dessus.
 */
function permaliensExclus(dir, acc = []) {
  for (const nom of readdirSync(dir)) {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) {
      if (nom === "_includes" || nom === "_data" || nom === "assets" || nom === "data-source") continue;
      permaliensExclus(chemin, acc);
    } else if (/\.(njk|md|html)$/.test(nom)) {
      const txt = readFileSync(chemin, "utf8");
      const fm = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fm || !/^sitemap:\s*false\s*$/m.test(fm[1])) continue;
      const perma = fm[1].match(/^permalink:\s*(.+)$/m);
      if (perma) {
        acc.push(perma[1].trim().replace(/['"]/g, "").replace(/index\.html$/, ""));
      }
    }
  }
  return acc;
}

if (!existsSync(join(PUBLIC, "sitemap.xml"))) {
  console.error("\n[sitemap] public/sitemap.xml absent — ce contrôle tourne APRÈS eleventy.\n");
  process.exit(1);
}

const xml = readFileSync(join(PUBLIC, "sitemap.xml"), "utf8");

// ⚠ La déclaration XML doit être le tout premier caractère. Un commentaire
// Nunjucks qui ne trime pas sa fin suffit à la décaler, et Google répond
// « impossible de récupérer le sitemap » sans jamais nommer la cause.
if (!xml.startsWith("<?xml")) {
  console.error("\n[sitemap] le fichier ne commence pas par la déclaration <?xml — un analyseur strict le refusera.\n");
  process.exit(1);
}

const annoncees = new Set(
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, ""))
);

const exclues = new Set(permaliensExclus(SRC));
const construites = pagesConstruites(PUBLIC).filter(
  (u) => !HORS_PERIMETRE.some((re) => re.test(u))
);

const manquantes = construites.filter((u) => !annoncees.has(u) && !exclues.has(u));
const fantomes = [...annoncees].filter((u) => !construites.includes(u));

console.log(`\nSitemap — ${annoncees.size} URL annoncée(s) pour ${construites.length} page(s) publique(s)`);
console.log(`           ${exclues.size} exclusion(s) déclarée(s) par « sitemap: false »\n`);

let echec = false;

if (manquantes.length) {
  echec = true;
  console.error(`✗ ${manquantes.length} page(s) construite(s) mais ABSENTE(S) du sitemap :\n`);
  for (const u of manquantes.slice(0, 15)) console.error(`    ${u}`);
  if (manquantes.length > 15) console.error(`    … et ${manquantes.length - 15} autre(s)`);
  console.error(`
  → Si c'est voulu, écrire « sitemap: false » dans le front matter de la page,
    avec la raison en commentaire. Une exclusion se déclare, elle ne se devine pas.
  → Si ce n'est pas voulu et que le gabarit est PAGINÉ, il lui manque
    « addAllPagesToCollections: true » : sans ce drapeau, Eleventy n'inscrit
    dans les collections que la première page, et le sitemap n'en voit qu'une.
`);
}

if (fantomes.length) {
  echec = true;
  console.error(`✗ ${fantomes.length} URL annoncée(s) sans page correspondante :\n`);
  for (const u of fantomes) console.error(`    ${u}`);
  console.error("\n  → Google explorera une 404. Vérifier le permalien.\n");
}

if (echec) process.exit(1);

console.log("✓ Toute page publique construite est annoncée, et réciproquement.\n");
