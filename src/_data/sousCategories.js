/**
 * Sous-catégories aplaties, prêtes pour la pagination Eleventy.
 *
 * Chaque entrée porte sa catégorie parente, ce qui permet à un unique template
 * de générer /categories/{categorie}/{sousCategorie}/ sans logique de lookup.
 * Les sous-catégories d'une catégorie retirée de la vente sont exclues.
 */
import categories from "./categories.js";

export default categories.flatMap((cat) =>
  (cat.sousCategories || [])
    .slice()
    .sort((a, b) => (a.ordre || 99) - (b.ordre || 99))
    .map((sous) => ({
      ...sous,
      categorieSlug: cat.slug,
      categorieNom: cat.nom,
      categorieNomCourt: cat.nomCourt || cat.nom,
      url: `/categories/${cat.slug}/${sous.slug}/`,
    }))
);
