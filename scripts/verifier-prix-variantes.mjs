/**
 * scripts/verifier-prix-variantes.mjs
 * Le prix annoncé dans les listes doit être un prix réellement payable.
 *
 * ─── Pourquoi ce script existe ────────────────────────────────────────────
 * Un produit à variantes porte PLUSIEURS prix : celui de la fiche (`prix`) et
 * celui de chaque variante. Les listes et les cartes affichent le prix de la
 * fiche ; le tunnel de commande facture celui de la variante choisie
 * (`lookupPrice` dans `_shared/catalog-index.js`). Rien ne les relie.
 *
 * Le 2026-09-24, le commerçant a baissé le prix d'une puff de 19,90 € à
 * 15,99 € dans l'éditeur de contenu. La carte a bien affiché 15,99 €. Les
 * trois saveurs, elles, sont restées à 19,90 € — et c'est ce montant qui
 * aurait été débité. Le site annonçait donc un prix, et en facturait un autre.
 *
 * Au-delà du bug, c'est une **pratique commerciale trompeuse** au sens des
 * articles L121-2 et suivants du code de la consommation : le prix annoncé
 * doit être celui que le client paie.
 *
 * ─── La règle, et son exception ───────────────────────────────────────────
 * Quand `unitePrix` est renseigné (les 19 fleurs, vendues au gramme), le prix
 * de la fiche est un prix UNITAIRE et les variantes sont des conditionnements :
 * 4,90 €/g donne 9,80 € les 2 g. L'écart est normal, le script l'ignore.
 *
 * Quand `unitePrix` est vide, le prix de la fiche est le prix du produit. Il
 * doit alors égaler le prix de la variante la moins chère — c'est ce que le
 * client voit avant de cliquer, et il doit pouvoir l'obtenir.
 *
 *   node scripts/verifier-prix-variantes.mjs
 *
 * Lancé par `npm run build`, il fait échouer la construction.
 * ─────────────────────────────────────────────────────────────────────────── */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DOSSIER = "src/data-source/produits";
const CENTIME = 0.005;   // tolérance : on compare des euros, pas des flottants

const anomalies = [];
let aVariantes = 0;
let auGramme = 0;

for (const nom of readdirSync(DOSSIER).filter((f) => f.endsWith(".json"))) {
  let fiche;
  try {
    fiche = JSON.parse(readFileSync(join(DOSSIER, nom), "utf8"));
  } catch (err) {
    console.error(`[prix] ✕ ${nom} illisible : ${err.message}`);
    process.exit(1);
  }

  const variantes = Array.isArray(fiche.variantes) ? fiche.variantes : [];
  if (!variantes.length) continue;
  aVariantes++;

  // Exception documentée : prix unitaire (fleurs au gramme).
  if (fiche.unitePrix) { auGramme++; continue; }

  const prixVariantes = variantes
    .map((v) => v.prix)
    .filter((p) => typeof p === "number" && Number.isFinite(p));

  if (prixVariantes.length !== variantes.length) {
    anomalies.push({
      slug: nom.replace(/\.json$/, ""),
      motif: "une variante au moins n'a pas de prix numérique",
    });
    continue;
  }

  const mini = Math.min(...prixVariantes);
  if (typeof fiche.prix !== "number") {
    anomalies.push({ slug: nom.replace(/\.json$/, ""), motif: "prix de fiche absent" });
    continue;
  }

  if (Math.abs(fiche.prix - mini) > CENTIME) {
    anomalies.push({
      slug: nom.replace(/\.json$/, ""),
      motif: `fiche à ${fiche.prix.toFixed(2)} €, variante la moins chère à ${mini.toFixed(2)} €`,
      actif: fiche.actif !== false,
    });
  }
}

if (anomalies.length) {
  console.error(`\n[prix] ✕ ${anomalies.length} fiche(s) annoncent un prix qu'on ne peut pas payer :\n`);
  for (const a of anomalies) {
    console.error(`       · ${a.slug}${a.actif === false ? " (retirée de la vente)" : ""}`);
    console.error(`         ${a.motif}`);
  }
  console.error("\n       Les listes affichent le prix de la fiche ; le panier facture");
  console.error("       celui de la variante. Un écart fait payer autre chose que le");
  console.error("       montant annoncé — pratique commerciale trompeuse (L121-2).");
  console.error("");
  console.error("       Corriger dans /admin/contenu/ : modifier le prix d'un produit à");
  console.error("       variantes suppose de le changer AUSSI sur chaque variante.");
  console.error("");
  console.error("       (Les fleurs au gramme sont exemptées : leur prix de fiche est");
  console.error("        un prix unitaire, pas le prix d'un conditionnement.)");
  process.exit(1);
}

console.log(
  `[prix] ✓ ${aVariantes} produits à variantes cohérents ` +
  `(dont ${auGramme} au prix unitaire, exemptés)`
);
