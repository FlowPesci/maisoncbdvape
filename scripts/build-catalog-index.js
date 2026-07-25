/**
 * scripts/build-catalog-index.js
 * Lit src/data-source/produits/ (un fichier JSON par produit)
 * et génère functions/_shared/catalog-index.js
 *
 * Structure du catalogue généré :
 *   CATALOG["product-id"]            → prix de base (float)
 *   CATALOG["product-id::label"]     → prix de variante (float)
 *
 * Utilisé côté Workers pour valider les prix envoyés par le client.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PRODUITS_DIR = join(ROOT, "src/data-source/produits");

const produits = readdirSync(PRODUITS_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(PRODUITS_DIR, f), "utf-8")));

const entries = {};
const avecVariantes = [];

for (const p of produits) {
  if (!p.id) continue;

  // Prix de base
  entries[p.id] = Number(p.prix);

  // Prix des variantes (clé : "id::label")
  if (Array.isArray(p.variantes)) {
    let n = 0;
    for (const v of p.variantes) {
      if (v.label && typeof v.prix === "number") {
        entries[`${p.id}::${v.label}`] = Number(v.prix);
        n++;
      }
    }
    // On mémorise les produits qui n'existent QUE sous forme de variantes :
    // pour eux, un label inconnu doit être rejeté et non retomber sur le prix
    // de base (sinon 8 g de fleur seraient facturés au tarif d'un gramme).
    if (n > 0) avecVariantes.push(p.id);
  }
}

const output = `/**
 * functions/_shared/catalog-index.js
 * ⚠ FICHIER GÉNÉRÉ AUTOMATIQUEMENT — ne pas éditer manuellement
 * Regénérer via : node scripts/build-catalog-index.js
 * (exécuté automatiquement à chaque build)
 */

// @ts-check

/** @type {Record<string, number>} */
export const CATALOG = ${JSON.stringify(entries, null, 2)};

/**
 * Produits déclinés en variantes (grammages, saveurs).
 * Pour ceux-là, un label absent du catalogue est une erreur, pas un cas de repli.
 * @type {Set<string>}
 */
export const PRODUITS_A_VARIANTES = new Set(${JSON.stringify(avecVariantes, null, 2)});

/**
 * Renvoie le prix serveur vérifié pour un article du panier.
 *
 * Règles :
 *  - label connu           → prix de la variante
 *  - label inconnu sur un produit à variantes → null (article rejeté)
 *  - pas de label          → prix de base, si le produit en a un
 *
 * @param {string} id          - ID produit (slug)
 * @param {string|null} label  - Label de variante (ou null pour le prix de base)
 * @returns {number|null}       - Prix TTC en euros, ou null si introuvable
 */
export function lookupPrice(id, label) {
  if (label) {
    const key = \`\${id}::\${label}\`;
    if (key in CATALOG) return CATALOG[key];
    // Label fourni mais inconnu : on refuse plutôt que de facturer le prix de base
    if (PRODUITS_A_VARIANTES.has(id)) return null;
  }
  if (id in CATALOG) return CATALOG[id];
  return null;
}
`;

mkdirSync(join(ROOT, "functions/_shared"), { recursive: true });
writeFileSync(join(ROOT, "functions/_shared/catalog-index.js"), output, "utf-8");

const count = Object.keys(entries).length;
console.log(`[catalog] ✓ ${count} entrées générées → functions/_shared/catalog-index.js`);
