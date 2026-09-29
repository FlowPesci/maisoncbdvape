/**
 * scripts/prix-fiche.mjs
 * Le prix affiché d'un produit — une seule définition, deux consommateurs.
 *
 * ─── Pourquoi ce module existe ────────────────────────────────────────────
 * Un produit à variantes portait DEUX prix saisis à la main : celui de la
 * fiche (`prix`, affiché dans les listes et les cartes) et celui de chaque
 * variante (facturé par le panier). Rien ne les reliait, et le commerçant
 * devait penser à modifier les deux — 4 champs pour une puff, 17 pour un
 * e-liquide.
 *
 * Le 2026-09-24, trois fiches divergeaient. L'une annonçait 15,99 € et
 * aurait facturé 19,90 €. Une autre avait des variantes **sans prix du
 * tout** : absentes du catalogue serveur, elles rendaient le produit
 * invendable — la commande était refusée au moment de valider, et rien ne
 * le signalait.
 *
 * La doctrine du projet est explicite : une règle écrite à deux endroits
 * finit toujours par diverger. Le prix de fiche d'un produit à variantes
 * est donc **calculé**, plus jamais saisi.
 *
 * ─── La règle ─────────────────────────────────────────────────────────────
 * · pas de variantes           → `prix` est la donnée, on la rend telle quelle
 * · `unitePrix` renseigné      → `prix` est un prix UNITAIRE (les 19 fleurs,
 *                                vendues au gramme : 4,90 €/g, les variantes
 *                                étant des conditionnements). Vraie donnée,
 *                                on n'y touche pas.
 * · variantes sans `unitePrix` → `prix` = la variante la MOINS CHÈRE. C'est
 *                                ce que le visiteur voit avant de cliquer, et
 *                                il doit pouvoir l'obtenir.
 *
 * ⚠ Si aucune variante n'a de prix exploitable, on renvoie `prix` tel quel
 *   plutôt que d'inventer une valeur : `verify:prix` bloque déjà ce cas, et
 *   afficher un chiffre faux serait pire que de laisser le contrôle parler.
 *
 * Importé par `src/_data/produits.js` (affichage) ET par
 * `scripts/build-catalog-index.js` (catalogue serveur). Les deux doivent
 * dire la même chose — c'est tout l'objet de ce fichier.
 * ─────────────────────────────────────────────────────────────────────────── */

/** @param {object} p fiche produit brute @returns {number|undefined} */
export function prixFiche(p) {
  const brutes = Array.isArray(p?.variantes) ? p.variantes : [];
  if (!brutes.length) return p?.prix;
  if (p.unitePrix) return p.prix;

  // ⚠ Sur les variantes RÉSOLUES, donc héritage compris : une saveur sans
  //   prix vaut désormais le prix de la fiche, et doit compter dans le
  //   « dès X € ». Lire `v.prix` brut ici annoncerait la variante la moins
  //   chère parmi celles qui ont un prix saisi, en ignorant les autres.
  const prix = variantesVendables(p).map((v) => v.prix);
  if (!prix.length) return p.prix;
  return Math.min(...prix);
}

const estNombre = (n) => typeof n === "number" && Number.isFinite(n);

/**
 * Le nombre de grammes que désigne un libellé de conditionnement.
 * « 4g » → 4 ; « 12 g » → 12 ; « Cherry ICE » → null.
 *
 * ⚠ Cette lecture vivait aussi dans `build-catalog-index.js`, qui s'en sert
 * pour rattacher une variante au vrac du produit. Deux copies d'une même
 * règle finissent toujours par diverger — celle-ci fait désormais autorité,
 * et le catalogue l'importe.
 */
export function grammesDe(label) {
  const m = String(label ?? "").match(/^\s*([\d.,]+)\s*g\s*$/i);
  const n = m ? parseFloat(m[1].replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Seuil en dessous duquel une économie n'est PAS annoncée.
 *
 * ⚠ Mesuré, pas choisi au hasard. Les tarifs actuels sont proportionnels,
 * mais les arrondis créent un bruit de ±0,2 % (9,99 € les 2 g font
 * 4,995 €/g quand 39,99 € les 8 g font 4,999 €/g). Annoncer « −0,1 % »
 * serait une réduction inventée par l'arrondi. 2 % laisse le bruit dehors et
 * reste bien en dessous de toute remise réelle.
 */
const SEUIL_ECONOMIE_PCT = 2;

/**
 * Les variantes réellement proposables, **prix résolu**.
 *
 * ─── L'héritage du prix produit (2026-09-29) ──────────────────────────────
 * Le commerçant vend ses saveurs au même tarif. Lui faire saisir quatre fois
 * le même nombre n'apportait rien et coûtait cher :
 *   · modifier un tarif demandait autant de gestes qu'il y a de saveurs ;
 *   · quatre champs à tenir cohérents, c'est quatre occasions d'en oublier un
 *     — c'est ainsi qu'une puff a annoncé 15,99 € et failli facturer 19,90 € ;
 *   · et une saveur ajoutée sans prix a éteint la boutique dix déploiements
 *     d'affilée.
 *
 * **Prix de variante vide → la variante se vend au prix de la fiche.** Le
 * champ reste là pour le jour où une saveur vaudra plus cher.
 *
 * ⚠ **SAUF sur les fleurs, et c'est le piège à ne jamais lever.** Quand
 * `unitePrix` est renseigné, `prix` est le prix D'UN GRAMME (4,90 €). Un
 * sachet de 4 g qui en hériterait serait vendu 4,90 € au lieu de 19,60 €.
 * Sur ces fiches, une variante sans prix reste une vraie erreur : elle est
 * écartée, et `verify:prix` la signale.
 *
 * ⚠ Cette fonction est la SEULE définition de l'héritage. `produits.js`
 * (affichage) et `build-catalog-index.js` (catalogue serveur) l'appellent
 * tous les deux — écrite deux fois, elle finirait par diverger, et on
 * retomberait sur « prix annoncé ≠ prix facturé ».
 *
 * @returns {Array<{label:string, prix:number, prixHerite?:boolean, …}>}
 */
export function variantesVendables(p) {
  const brutes = Array.isArray(p?.variantes) ? p.variantes : [];
  const heritagePossible = !p?.unitePrix && estNombre(p?.prix);

  const retenues = brutes.flatMap((v) => {
    const label = String(v?.label ?? "").trim();
    if (!label) return [];                       // sans libellé : rien à proposer
    if (estNombre(v?.prix)) return [{ ...v, label }];
    if (heritagePossible) return [{ ...v, label, prix: p.prix, prixHerite: true }];
    return [];                                   // fleur sans prix : écartée
  });

  return p?.unitePrix === "g" ? avecPrixAuGramme(retenues) : retenues;
}

/**
 * Prix au gramme de chaque conditionnement, et économie réelle s'il y en a une.
 *
 * ─── Pourquoi c'est calculé et jamais saisi ───────────────────────────────
 * Le commerçant voulait « montrer au client qu'il a un avantage à prendre 4 g
 * plutôt que 2 ». Mesure faite le 2026-09-29 sur les 17 fiches au gramme :
 * **cet avantage n'existait pas**. Les tarifs étaient strictement
 * proportionnels — 8 g à 39,20 € contre quatre fois 9,80 €, soit exactement
 * la même chose. Une seule fiche s'écartait, et dans le mauvais sens : le
 * Garlic facturait les 2 g **20 % plus cher au gramme**.
 *
 * Afficher « avantage » là-dessus aurait été une annonce de réduction sans
 * réduction — le terrain que `prixBarre` venait de coûter. D'où ce choix :
 * **l'économie se constate, elle ne se déclare pas.** Le repère n'apparaît
 * que si les chiffres la portent ; il reste invisible tant que les tarifs
 * sont proportionnels, et s'allume tout seul le jour où le commerçant baisse
 * un conditionnement.
 *
 * ⚠ La référence est le **plus petit conditionnement**, pas le prix de fiche.
 * C'est la comparaison que fait le client : « si je prends 4 g au lieu de 2 ».
 * Comparer au prix de fiche annoncerait une économie sur un format que
 * personne ne peut acheter.
 *
 * ⚠ Le pourcentage est arrondi **vers le bas** (`Math.floor`). Une économie
 * de 9,7 % s'affiche « −9 % » : mieux vaut promettre moins que le client ne
 * reçoit.
 */
function avecPrixAuGramme(variantes) {
  const avecG = variantes
    .map((v) => ({ v, g: grammesDe(v.label) }))
    .filter((x) => x.g !== null);

  if (avecG.length < 1) return variantes;

  avecG.sort((a, b) => a.g - b.g);
  const refUnitaire = avecG[0].v.prix / avecG[0].g;

  const parLabel = new Map();
  for (const { v, g } of avecG) {
    const unitaire = v.prix / g;
    const gainPct = ((refUnitaire - unitaire) / refUnitaire) * 100;
    parLabel.set(v.label, {
      grammes: g,
      prixAuGramme: Math.round(unitaire * 1000) / 1000,
      // `null` — et non 0 — quand il n'y a rien à annoncer : le gabarit teste
      // la présence, pas la valeur.
      economiePct: gainPct >= SEUIL_ECONOMIE_PCT ? Math.floor(gainPct) : null,
    });
  }

  return variantes.map((v) => (parLabel.has(v.label) ? { ...v, ...parLabel.get(v.label) } : v));
}

/** Une variante est proposable si elle a un libellé ET un prix exploitable. */
export function varianteVendable(v) {
  return Boolean(v && String(v.label ?? "").trim() && estNombre(v.prix));
}

/**
 * Applique la règle à une fiche, sans la muter.
 * `prixSaisi` conserve la valeur d'origine : utile pour expliquer au
 * commerçant que son champ est décoratif, et pour diagnostiquer un écart.
 *
 * ⚠ **Les variantes sans prix sont RETIRÉES de l'affichage**, et c'est le
 * point le plus important de ce module.
 *
 * `build-catalog-index.js` ne les inscrit pas au catalogue serveur — elles
 * n'ont pas de prix à facturer. Mais le gabarit, lui, les affichait : le
 * client voyait la saveur, la choisissait, remplissait ses coordonnées, et sa
 * commande était refusée à la validation par un « prix introuvable ». Le
 * défaut n'apparaissait nulle part avant ce moment-là.
 *
 * Le 2026-09-29, le commerçant a ajouté deux saveurs à `jnr-32000-puffs`
 * sans leur donner de prix. `verify:prix` faisait alors **échouer la
 * construction** : dix déploiements refusés d'affilée, toute la boutique
 * hors ligne, et lui sans moyen de comprendre pourquoi.
 *
 * Retirer la variante à l'affichage règle les deux problèmes d'un coup :
 * le client ne peut plus choisir une saveur invendable, et le site n'a plus
 * aucune raison de tomber. `verify:prix` se contente désormais d'avertir.
 *
 * ⚠ Si AUCUNE variante n'a de prix, le produit retombe sur son `prix` de
 * fiche et se vend comme un produit simple — `build-catalog-index.js`
 * inscrit toujours `entries[p.id]`, la commande aboutit donc. Un produit
 * vendu sans son choix de saveur est un moindre mal devant un produit
 * invendable, ou devant une boutique éteinte.
 */
export function avecPrixCalcule(p) {
  const variantes = Array.isArray(p?.variantes) ? p.variantes : [];
  const vendables = variantesVendables(p);
  const aFiltre = vendables.length !== variantes.length;

  const aHerite = vendables.some((v) => v.prixHerite);

  // ⚠ Dès qu'il y a des variantes, on rend TOUJOURS la version résolue : pas
  //   de raccourci. `variantesVendables()` fait plus qu'ajouter un prix, elle
  //   normalise aussi les libellés (`trim`). Le raccourci laissait donc
  //   passer les libellés bruts à l'affichage pendant que le catalogue
  //   serveur, lui, recevait les libellés nettoyés.
  //
  //   Constaté à l'écriture même de cette règle, sur
  //   `pod-de-remplacement-aerox-32k-jnr` : deux saveurs au libellé terminé
  //   par une espace. La page proposait « Pastèque Glacée␣ », le catalogue
  //   connaissait « Pastèque Glacée » — une espace invisible, et la commande
  //   aurait été refusée sur un « prix introuvable ».
  //
  //   C'est exactement la divergence que ce module existe pour supprimer, et
  //   elle est réapparue par une optimisation de trois mots.
  const calcule = prixFiche(p);
  if (calcule === p?.prix && !aFiltre && !aHerite && !variantes.length) return p;

  const fiche = { ...p, prix: calcule };
  if (calcule !== p?.prix) fiche.prixSaisi = p?.prix;
  // ⚠ Les variantes sont TOUJOURS remplacées par leur version résolue, même
  //   si aucune n'a été écartée : c'est ce qui porte le prix hérité jusqu'aux
  //   gabarits. Ne garder les brutes que « s'il n'y a rien à filtrer » ferait
  //   afficher une saveur sans prix.
  if (vendables.length) fiche.variantes = vendables;
  if (aFiltre) {
    fiche.variantes = vendables;
    // Trace lisible pour le back-office et les contrôles : ce qui a été
    // écarté, et pourquoi, plutôt qu'une disparition silencieuse.
    const gardes = new Set(vendables.map((v) => v.label));
    fiche.variantesEcartees = variantes
      .map((v) => String(v?.label ?? "(sans libellé)").trim())
      .filter((l) => !gardes.has(l));
  }
  return fiche;
}
