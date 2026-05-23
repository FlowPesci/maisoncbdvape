/**
 * Adaptateur Eleventy : lit src/data-source/produits/ (un fichier JSON par produit,
 * édités par Decap CMS en collection folder) et expose le tableau aux templates.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FOLDER = resolve(__dirname, "../data-source/produits");

const produits = readdirSync(FOLDER)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(FOLDER, f), "utf8")));

export default produits;
