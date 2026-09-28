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
import { prixFiche } from "./prix-fiche.mjs";

const DOSSIER = "src/data-source/produits";

const anomalies = [];
const avertissements = [];
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

  const slugCourant = nom.replace(/\.json$/, "");

  // ── Prix barré : une réduction annoncée doit en être une ─────────────────
  //
  // ⚠ Contrôle LÉGAL, pas cosmétique. Annoncer un prix de référence qui n'est
  // pas supérieur au prix pratiqué est une annonce de réduction de prix
  // trompeuse (art. L121-2 et suivants, et les règles propres aux annonces de
  // réduction). Le badge « Promo » et le prix barré sont affichés
  // automatiquement dès que `prixBarre` existe : personne ne relit la
  // cohérence des deux nombres.
  //
  // Constaté le 2026-09-28 sur `garlic-hydro-indoor-cbd` : la fiche affichait
  // **11,99 € barré de 6,99 €** — un « ancien prix » moins cher que le
  // nouveau. La cause n'était pas le prix barré mais `unitePrix` laissé vide
  // (voir plus bas) : le prix de fiche était alors le pack de 2 g et non le
  // gramme. Un défaut se lisait donc sur un champ que personne n'avait touché.
  //
  // La comparaison porte sur `prixFiche()`, le prix RÉELLEMENT affiché, pas
  // sur `fiche.prix` brut — sans quoi le contrôle raterait exactement ce cas.
  const barre = fiche.prixBarre;
  const affiche = prixFiche(fiche);
  if (
    typeof barre === "number" && Number.isFinite(barre) && barre > 0 &&
    typeof affiche === "number" && Number.isFinite(affiche) &&
    barre <= affiche
  ) {
    anomalies.push({
      slug: slugCourant,
      enVente: fiche.actif !== false,
      motif:
        `prix barré ${barre} € ≤ prix affiché ${affiche} € — réduction trompeuse.\n` +
        `         Le prix de référence doit être SUPÉRIEUR au prix pratiqué, sinon\n` +
        `         le badge « Promo » annonce une remise qui n'existe pas (L121-2).\n` +
        `         Vider « Prix barré », ou vérifier « Unité de prix » : un prix de\n` +
        `         fiche calculé sur un pack au lieu du gramme produit ce symptôme.`,
    });
  }

  const variantes = Array.isArray(fiche.variantes) ? fiche.variantes : [];
  if (!variantes.length) continue;
  aVariantes++;

  // ── Fleur au gramme sans unité de prix ───────────────────────────────────
  //
  // Les fleurs et résines se vendent AU GRAMME : `unitePrix: "g"`, et `prix`
  // est alors le prix du gramme, saisi à la main (voir CLAUDE.md — l'écart
  // avec les variantes y est la règle : 4,90 €/g donne 9,80 € les 2 g).
  //
  // Laisser `unitePrix` vide sur une telle fiche fait basculer `prixFiche()`
  // sur « la variante la moins chère » : le catalogue annonce alors le prix
  // d'un PACK dans une colonne libellée « €/g », à côté de voisins affichés
  // au gramme. Le client compare 11,99 à 4,90 sur la même ligne.
  //
  // Le repère est le libellé des variantes : « 2g », « 4g », « 8 g » désignent
  // des grammages, pas des saveurs. C'est une heuristique, donc ce point
  // AVERTIT sans bloquer — le commerçant peut légitimement vendre une fleur
  // en sachets préemballés un jour.
  const grammages = variantes.filter((v) =>
    /^\s*\d+([.,]\d+)?\s*g?\s*$/i.test(String(v?.label ?? "")),
  );
  if (!fiche.unitePrix && grammages.length && grammages.length === variantes.length) {
    avertissements.push(
      `${slugCourant} : ${variantes.length} variantes en grammes, mais « Unité de prix » est vide.\n` +
      `         Le prix affiché devient celui du plus petit pack (${affiche} €) au lieu du\n` +
      `         prix au gramme. Renseigner « g » dans l'éditeur de contenu.`,
    );
  }

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

if (avertissements.length) {
  console.log(`\n[prix] ⚠ ${avertissements.length} fiche(s) à vérifier :\n`);
  for (const a of avertissements) console.log(`       · ${a}\n`);
}

if (anomalies.length) {
  const enVente = anomalies.filter((a) => a.enVente).length;
  console.error(`\n[prix] ✕ ${anomalies.length} problème(s) de prix :\n`);
  for (const a of anomalies) {
    console.error(`       · ${a.slug}${a.enVente ? "" : "  (retirée de la vente)"}`);
    console.error(`         ${a.motif}`);
  }

  // Le rappel ne vaut que pour les variantes sans prix : l'afficher sous une
  // anomalie de prix barré enverrait chercher au mauvais endroit.
  if (anomalies.some((a) => a.motif.startsWith("Une variante") || / variante\(s\) sans /.test(a.motif))) {
    console.error("");
    console.error("       Une variante sans prix n'entre pas dans le catalogue serveur :");
    console.error("       le client la choisit, remplit ses coordonnées, et sa commande");
    console.error("       est refusée à la validation (« prix introuvable »). Le défaut");
    console.error("       n'apparaît nulle part avant ce moment-là.");
    console.error("");
    console.error("       Corriger dans /admin/contenu/ : renseigner le prix de CHAQUE");
    console.error("       variante. Le prix de la fiche, lui, se calcule tout seul.");
  }
  if (!enVente) console.error("\n       (Aucune n'est en vente — corriger avant de les réactiver.)");
  process.exit(1);
}

console.log(
  `[prix] ✓ ${variantesVues} variantes sur ${aVariantes} produits, ` +
  `toutes commandables`
);
