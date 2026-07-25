/**
 * Adaptateur Eleventy : lit src/data-source/produits/ (un fichier JSON par produit,
 * édités par Decap CMS en collection folder) et expose le tableau aux templates.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FOLDER = resolve(__dirname, "../data-source/produits");

/**
 * Un produit dont "actif" vaut false est retiré de la vente : il n'est ni
 * généré en page, ni listé, ni indexé, ni ajouté au catalogue de prix serveur.
 * Sa fiche reste dans le projet pour pouvoir le remettre en vente d'un drapeau.
 * Un produit sans clé "actif" est considéré comme actif.
 */
const produits = readdirSync(FOLDER)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(FOLDER, f), "utf8")))
  .filter((p) => p.actif !== false);

export default produits;
