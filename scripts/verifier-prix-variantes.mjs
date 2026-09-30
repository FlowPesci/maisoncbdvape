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
import { prixFiche, grammesDe } from "./prix-fiche.mjs";

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
    // ⚠ AVERTIT, ne bloque pas — et ce choix a été payé.
    //
    // Cette vérification a d'abord fait échouer la construction. Le
    // 2026-09-29, dix déploiements d'affilée ont été refusés pendant que le
    // commerçant modifiait ses fiches : n'importe quel nombre saisi dans
    // « Prix barré » mettait la boutique entière hors ligne, sans qu'il
    // puisse ni le voir ni le comprendre. C'est mot pour mot le défaut que
    // `--strict` avait déjà causé trois jours plus tôt, et que la règle
    // écrite dans CLAUDE.md interdisait — règle que j'ai enfreinte en
    // écrivant ce contrôle.
    //
    // La protection juridique n'est pas perdue pour autant, elle a changé de
    // place : `product-card.njk` et `produit-detail.njk` n'affichent le prix
    // barré QUE s'il est strictement supérieur au prix. La remise mensongère
    // est donc impossible à rendre, et la boutique reste debout.
    //
    // La leçon générale : quand un contrôle porte sur une donnée que le
    // commerçant saisit, faire dégrader la PAGE plutôt que tomber la
    // construction.
    avertissements.push(
      `${slugCourant} : prix barré ${barre} € ≤ prix affiché ${affiche} €.\n` +
      `         Le prix barré n'est PAS affiché dans ce cas — une remise annoncée\n` +
      `         doit en être une (L121-2). Vider « Prix barré », ou vérifier\n` +
      `         « Unité de prix » : un prix calculé sur un pack au lieu du gramme\n` +
      `         produit exactement ce symptôme.`,
    );
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

  // ⚠ AVERTIT, ne bloque pas — et c'est la troisième fois que cette leçon
  //   se paie. Ajouter une saveur sans lui donner de prix est le geste le
  //   plus banal du monde dans l'éditeur de contenu : on crée la ligne, on
  //   écrit le libellé, on enregistre, on remplira le prix après.
  //
  //   Le 2026-09-29, deux saveurs ajoutées à `jnr-32000-puffs` ont fait
  //   échouer DIX déploiements d'affilée. La boutique entière hors ligne
  //   pour deux champs vides, et le commerçant sans aucun moyen de le voir.
  //
  //   La protection n'est pas perdue, elle a changé de place :
  //   `avecPrixCalcule()` (prix-fiche.mjs) retire ces variantes de
  //   l'affichage. Le client ne peut plus choisir une saveur invendable —
  //   ce que le blocage, lui, n'empêchait pas : il se contentait de
  //   refuser de déployer.
  if (sansLabel.length) {
    avertissements.push(
      `${slug} : ${sansLabel.length} variante(s) sans libellé — retirée(s) de l'affichage.`,
    );
  }
  // ⚠ Une variante sans prix n'est plus une anomalie en soi : depuis le
  //   2026-09-29, elle HÉRITE du prix de la fiche (voir `variantesVendables`).
  //   Le commerçant vend ses saveurs au même tarif — lui faire saisir quatre
  //   fois le même nombre ne servait qu'à créer des occasions d'erreur.
  //
  //   Elle le redevient sur une fleur au gramme, où l'héritage est refusé :
  //   `prix` y vaut le GRAMME, et un sachet de 4 g qui en hériterait serait
  //   vendu 4,90 € au lieu de 19,60 €. Là, la variante est réellement écartée
  //   et le client ne peut plus l'acheter — il faut le dire.
  if (sansPrix.length && fiche.unitePrix) {
    avertissements.push(
      `${slug}${enVente ? "" : " (retirée de la vente)"} : ` +
      `${sansPrix.length} conditionnement(s) sans prix, RETIRÉ(S) de la vente :\n` +
      `         ${sansPrix.slice(0, 4).join(", ")}` +
      (sansPrix.length > 4 ? `, +${sansPrix.length - 4}` : "") + `\n` +
      `         Cette fiche est vendue au ${fiche.unitePrix} : le prix ne peut pas être\n` +
      `         hérité (4,90 €/g donne 19,60 € les 4 g, pas 4,90 €). Saisir le prix\n` +
      `         de chaque conditionnement dans /admin/contenu/.`,
    );
  }

  // ── L'échelle au gramme doit rester DÉCROISSANTE ─────────────────────────
  //
  // ⚠ C'est le piège de la dégressivité, et il est arrivé avec elle. Depuis le
  //   2026-09-29 la fiche affiche le prix au gramme réel de chaque
  //   conditionnement (`.gram-btn-unitaire`) : le client compare donc les
  //   formats entre eux, ce qu'il ne pouvait pas faire avant.
  //
  //   Remiser un seul format rend mécaniquement les plus gros PLUS CHERS au
  //   gramme. Remiser les 4 g sans toucher aux 8 g donne 4,40 €/g contre
  //   4,90 €/g : un sachet deux fois plus gros vendu plus cher au gramme, écrit
  //   noir sur blanc sous les deux boutons. Ça ressemble à une erreur de
  //   saisie, et ça en est une.
  //
  //   Le commerçant fixe lui-même ses prix, référence par référence — ils ne
  //   sont pas les mêmes d'une fleur à l'autre, il n'y a donc aucune grille à
  //   appliquer en lot. Personne ne relira ces échelles à sa place : ce
  //   contrôle est le seul endroit où l'incohérence se voit.
  //
  // ⚠ AVERTIT, jamais ne bloque : c'est une donnée saisie par le commerçant.
  //   La page, elle, reste juste — elle affiche le prix réel et éteint le
  //   repère « −X %/g », qui ne s'allume que sur une économie réelle.
  if (fiche.unitePrix === "g") {
    const paliers = variantes
      .map((v) => ({
        label: String(v?.label ?? "").trim(),
        g: grammesDe(v?.label),
        prix: v?.prix,
      }))
      .filter((x) => x.g && typeof x.prix === "number" && Number.isFinite(x.prix))
      .map((x) => ({ ...x, unitaire: x.prix / x.g }))
      .sort((a, b) => a.g - b.g);

    const remontees = [];
    for (let i = 1; i < paliers.length; i++) {
      const bas = paliers[i - 1];
      const haut = paliers[i];
      // Même seuil de 2 % que le repère d'économie, et pour la même raison :
      // les arrondis créent un bruit de ±0,9 % (9,99 € les 10 g font
      // 0,999 €/g quand la fiche annonce 0,99 €/g). En dessous, il n'y a
      // rien à signaler.
      const ecart = ((haut.unitaire - bas.unitaire) / bas.unitaire) * 100;
      if (ecart >= 2) remontees.push({ bas, haut, ecart });
    }

    for (const r of remontees) {
      avertissements.push(
        `${slug} : le ${r.haut.label} est PLUS CHER au gramme que le ${r.bas.label}\n` +
        `         ${r.haut.prix.toFixed(2)} € / ${r.haut.g} g = ${r.haut.unitaire.toFixed(2)} €/g` +
        `   contre   ${r.bas.prix.toFixed(2)} € / ${r.bas.g} g = ${r.bas.unitaire.toFixed(2)} €/g` +
        `   (+${r.ecart.toFixed(0)} %)\n` +
        `         Les deux prix au gramme sont affichés côte à côte sur la fiche : le\n` +
        `         client voit qu'il paie le grand format plus cher. Baisser le ${r.haut.label}\n` +
        `         ou remonter le ${r.bas.label} dans /admin/contenu/.`,
      );
    }
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
