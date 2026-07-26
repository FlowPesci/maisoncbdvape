/**
 * scripts/seed-stocks.js
 * Génère db/seed.sql : insertion des produits absents de la table stocks.
 *
 * ⚠ Idempotent par construction. « INSERT OR IGNORE » n'écrase jamais un
 * stock existant : rejouer ce script après une vente ne remet rien à zéro.
 * Le champ "stock" des fiches produits n'est donc lu qu'à la toute première
 * insertion d'un produit — ensuite, la vérité est en base.
 *
 * Usage :
 *   node scripts/seed-stocks.js
 *   npx wrangler d1 execute maisoncbdvape-stocks --file=db/seed.sql --remote
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PRODUITS_DIR = join(ROOT, "src/data-source/produits");

const produits = readdirSync(PRODUITS_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(PRODUITS_DIR, f), "utf-8")))
  .filter((p) => p.id && p.actif !== false);

const echappe = (s) => String(s).replace(/'/g, "''");
const entier = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);

const lignes = [];
let n = 0;

for (const p of produits) {
  if (Array.isArray(p.variantes) && p.variantes.length) {
    // Produit à variantes : le stock se tient au niveau de chaque variante.
    for (const v of p.variantes) {
      if (!v.label) continue;
      lignes.push(
        `INSERT OR IGNORE INTO stocks (cle, dispo, reserve, libelle, majLe) ` +
        `VALUES ('${echappe(p.id)}::${echappe(v.label)}', ${entier(v.stock)}, 0, ` +
        `'${echappe(p.nom)} — ${echappe(v.label)}', unixepoch() * 1000);`
      );
      n++;
    }
  } else {
    lignes.push(
      `INSERT OR IGNORE INTO stocks (cle, dispo, reserve, libelle, majLe) ` +
      `VALUES ('${echappe(p.id)}', ${entier(p.stock)}, 0, ` +
      `'${echappe(p.nom)}', unixepoch() * 1000);`
    );
    n++;
  }
}

const sortie = `-- ═══════════════════════════════════════════════════════════════════════════
-- GÉNÉRÉ AUTOMATIQUEMENT par scripts/seed-stocks.js — ne pas éditer
-- ${n} entrées de stock, ${produits.length} produits actifs
--
-- Rejouable sans risque : INSERT OR IGNORE laisse intacts les stocks déjà
-- présents. Ce fichier ne sert qu'à faire entrer les NOUVEAUX produits.
-- ═══════════════════════════════════════════════════════════════════════════

${lignes.join("\n")}
`;

mkdirSync(join(ROOT, "db"), { recursive: true });
writeFileSync(join(ROOT, "db/seed.sql"), sortie, "utf-8");
console.log(`[stocks] ✓ ${n} entrées depuis ${produits.length} produits actifs → db/seed.sql`);
