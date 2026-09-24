/**
 * Adaptateur Eleventy : lit src/data-source/produits/ (un fichier JSON par produit,
 * édités par Decap CMS en collection folder) et expose le tableau aux templates.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { avecPrixCalcule } from "../../scripts/prix-fiche.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FOLDER = resolve(__dirname, "../data-source/produits");

/**
 * Un produit dont "actif" vaut false est retiré de la vente : il n'est ni
 * généré en page, ni listé, ni indexé, ni ajouté au catalogue de prix serveur.
 * Sa fiche reste dans le projet pour pouvoir le remettre en vente d'un drapeau.
 * Un produit sans clé "actif" est considéré comme actif.
 */
/**
 * ⚠ Le prix affiché d'un produit à variantes est **calculé**, pas lu.
 *
 * Le champ `prix` saisi dans l'éditeur de contenu est ignoré dès qu'il y a
 * des variantes (sauf prix unitaire des fleurs) : c'est la variante la moins
 * chère qui fait foi, parce que c'est elle que le client peut réellement
 * payer. Voir `scripts/prix-fiche.mjs` pour la règle et la raison.
 *
 * `scripts/build-catalog-index.js` applique EXACTEMENT la même fonction au
 * catalogue serveur : affichage et facturation ne peuvent plus diverger.
 */
const produits = readdirSync(FOLDER)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(FOLDER, f), "utf8")))
  .filter((p) => p.actif !== false)
  .map(avecPrixCalcule);

export default produits;
