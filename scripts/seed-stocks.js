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
  // Produit vendu au poids : un seul stock, en grammes, au niveau du produit.
  // Ses variantes (2g, 4g, 8g) puisent toutes dans ce vrac.
  const auPoids = p.unitePrix === "g" && Array.isArray(p.variantes) && p.variantes.length;

  if (auPoids) {
    lignes.push(
      `INSERT OR IGNORE INTO stocks (cle, dispo, reserve, libelle, majLe) ` +
      `VALUES ('${echappe(p.id)}', ${entier(p.stock)}, 0, ` +
      `'${echappe(p.nom)} (vrac, en g)', unixepoch() * 1000);`
    );
    n++;
  } else if (Array.isArray(p.variantes) && p.variantes.length) {
    // Produit à variantes vendues à l'unité : un stock par variante.
    for (const v of p.variantes) {
      // ⚠ `trim()` OBLIGATOIRE, et c'est la clé de stock qui en dépend.
      //
      //   `variantesVendables()` (prix-fiche.mjs) normalise les libellés avant
      //   de les écrire dans le catalogue serveur. Semer la valeur BRUTE crée
      //   donc une ligne que personne n'ira jamais chercher : la fiche vend
      //   « Peach Ice », la base porte « Peach Ice␣ », et `reserverPanier()`
      //   ne touche aucune ligne — la saveur est silencieusement invendable.
      //
      //   Trois libellés étaient dans ce cas au 2026-10-03 (« Peach Ice »,
      //   « Pastèque Glacée », « Pastèque Mangue Pêche »). Le défaut n'aurait
      //   été visible qu'à la première commande refusée.
      const label = String(v.label ?? "").trim();
      if (!label) continue;
      lignes.push(
        `INSERT OR IGNORE INTO stocks (cle, dispo, reserve, libelle, majLe) ` +
        `VALUES ('${echappe(p.id)}::${echappe(label)}', ${entier(v.stock)}, 0, ` +
        `'${echappe(p.nom)} — ${echappe(label)}', unixepoch() * 1000);`
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
