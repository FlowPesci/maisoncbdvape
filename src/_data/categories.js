import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(__dirname, "../data-source/categories.json");
const raw = JSON.parse(readFileSync(SOURCE, "utf8"));
const toutes = Array.isArray(raw) ? raw : (raw.categories || []);

/**
 * Une catégorie dont "actif" vaut false est retirée du site : plus de page,
 * plus d'entrée de navigation, plus de vignette sur l'accueil. Sa définition
 * reste dans categories.json pour pouvoir la rouvrir d'un drapeau.
 * Une catégorie sans clé "actif" est considérée comme active.
 */
export default toutes.filter((c) => c.actif !== false);
