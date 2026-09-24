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
  const variantes = Array.isArray(p?.variantes) ? p.variantes : [];
  if (!variantes.length) return p?.prix;
  if (p.unitePrix) return p.prix;

  const prix = variantes
    .map((v) => v?.prix)
    .filter((n) => typeof n === "number" && Number.isFinite(n));

  if (!prix.length) return p.prix;
  return Math.min(...prix);
}

/**
 * Applique la règle à une fiche, sans la muter.
 * `prixSaisi` conserve la valeur d'origine : utile pour expliquer au
 * commerçant que son champ est décoratif, et pour diagnostiquer un écart.
 */
export function avecPrixCalcule(p) {
  const calcule = prixFiche(p);
  if (calcule === p?.prix) return p;
  return { ...p, prix: calcule, prixSaisi: p?.prix };
}
