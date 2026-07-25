/**
 * Créneaux de retrait exposés aux templates.
 *
 * Ré-export du module généré par scripts/build-catalog-index.js, lui-même
 * dérivé des horaires d'ouverture de src/_data/site.json. Passer par ce
 * fichier plutôt que de recalculer les créneaux garantit que le calendrier
 * affiché au client et la validation serveur ne peuvent pas diverger.
 *
 * `npm run build` exécute la génération avant Eleventy.
 */
import { CRENEAUX } from "../../functions/_shared/livraison.js";

export default CRENEAUX;
