/**
 * scripts/verifier-prix-variantes.mjs
 * Toute variante proposée au client doit être réellement commandable.
 *
 * ─── Ce que ce script surveillait au départ, et pourquoi ce n'est plus ça ──
 * Écrit le 2026-09-24 pour attraper l'écart entre le prix affiché (`prix` de
 * la fiche) et le prix facturé (celui de la variante choisie) : le site
 * annonçait 15,99 € et aurait débité 19,90 €.
 *
 * Cet écart ne peut plus exister : `scripts/prix-fiche.mjs` **calcule**
 * désormais le prix de fiche d'un produit à variantes, et la même fonction
 * sert à l'affichage (`src/_data/produits.js`) et au catalogue serveur
 * (`build-catalog-index.js`). Contrôler l'égalité reviendrait à tester que
 * `Math.min` fonctionne.
 *
 * ─── Ce qu'il surveille maintenant ────────────────────────────────────────
 * Le défaut voisin, découvert le même jour et bien plus sournois : une
 * variante **sans prix numérique**. `build-catalog-index.js` ne l'inscrit pas
 * au catalogue (`if (v.label && typeof v.prix === "number")`), donc
 * `lookupPrice` renvoie `null` et la commande est refusée avec « Article
 * inconnu ou prix introuvable ».
 *
 * Le produit s'affiche normalement, le client choisit sa saveur, remplit ses
 * coordonnées — et l'échec ne survient qu'à la validation. `pod-de-
 * remplacement-aerox-32k-jnr` était dans cet état avec ses douze saveurs :
 * invendable, sans que rien ne le signale nulle part.
 *
 *   node scripts/verifier-prix-variantes.mjs
 *
 * Lancé par `npm run build`, il fait échouer la construction.
 * ─────────────────────────────────────────────────────────────────────────── */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DOSSIER = "src/data-source/produits";

const anomalies = [];
let aVariantes = 0;
let variantesVues = 0;

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

  const sansPrix = [];
  const sansLabel = [];

  for (const v of variantes) {
    variantesVues++;
    if (!v?.label || !String(v.label).trim()) { sansLabel.push(v); continue; }
    if (typeof v.prix !== "number" || !Number.isFinite(v.prix)) sansPrix.push(String(v.label).trim());
  }

  const slug = nom.replace(/\.json$/, "");
  const enVente = fiche.actif !== false;

  if (sansLabel.length) {
    anomalies.push({ slug, enVente, motif: `${sansLabel.length} variante(s) sans libellé` });
  }
  if (sansPrix.length) {
    anomalies.push({
      slug,
      enVente,
      motif: `${sansPrix.length} variante(s) sans prix : ${sansPrix.slice(0, 4).join(", ")}` +
             (sansPrix.length > 4 ? `, +${sansPrix.length - 4}` : ""),
    });
  }
}

if (anomalies.length) {
  const enVente = anomalies.filter((a) => a.enVente).length;
  console.error(`\n[prix] ✕ ${anomalies.length} fiche(s) proposent des variantes non commandables :\n`);
  for (const a of anomalies) {
    console.error(`       · ${a.slug}${a.enVente ? "" : "  (retirée de la vente)"}`);
    console.error(`         ${a.motif}`);
  }
  console.error("");
  console.error("       Une variante sans prix n'entre pas dans le catalogue serveur :");
  console.error("       le client la choisit, remplit ses coordonnées, et sa commande");
  console.error("       est refusée à la validation (« prix introuvable »). Le défaut");
  console.error("       n'apparaît nulle part avant ce moment-là.");
  console.error("");
  console.error("       Corriger dans /admin/contenu/ : renseigner le prix de CHAQUE");
  console.error("       variante. Le prix de la fiche, lui, se calcule tout seul.");
  if (!enVente) console.error("\n       (Aucune n'est en vente — corriger avant de les réactiver.)");
  process.exit(1);
}

console.log(
  `[prix] ✓ ${variantesVues} variantes sur ${aVariantes} produits, ` +
  `toutes commandables`
);
