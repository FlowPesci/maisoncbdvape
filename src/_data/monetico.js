/**
 * src/_data/monetico.js
 * Le paiement par carte est-il réellement disponible ?
 *
 * ─── Pourquoi ce fichier existe ───────────────────────────────────────────
 * La page de commande affichait « Payer en ligne (CB) » en toutes
 * circonstances. Tant que la banque n'a pas fourni le n° de TPE et le code
 * société, ce bouton mène à une erreur : `create-payment.js` refuse de
 * construire un formulaire de paiement sans configuration complète.
 *
 * C'est la règle d'interface du dépôt, celle qui a déjà produit deux défauts
 * — le bouton « Me prévenir lors du retour en stock » qui était désactivé et
 * ne prévenait personne, et les puces de saveurs qui ressemblaient à des
 * boutons sans écouter le clic :
 *
 *   ⚠ CE QUI RESSEMBLE À UN CHOIX DOIT EN ÊTRE UN.
 *
 * Un bouton de paiement mort est la pire occurrence de cette famille : le
 * client est au bout du tunnel, prêt à payer, et il tombe sur une erreur. Il
 * ne recommence pas, et rien ne le signale au commerçant.
 *
 * ─── Pourquoi lire wrangler.toml ──────────────────────────────────────────
 * Parce que c'est la source unique des variables non chiffrées de ce projet
 * — le tableau de bord Cloudflare y est en lecture seule. Lire ailleurs,
 * ou recopier l'information dans un drapeau à maintenir à la main, la ferait
 * diverger le jour où la banque répond.
 *
 * ⚠ Le contrôle porte sur TPE et société, pas sur la clé MAC : celle-ci est
 * un secret, elle ne vit pas dans ce fichier et ne peut pas être vérifiée à
 * la construction. Si elle manquait alors que les deux autres sont remplies,
 * le bouton s'afficherait et le serveur renverrait une erreur explicite.
 * C'est assumé : les trois valeurs arrivent ensemble, de la même banque, le
 * même jour.
 * ─────────────────────────────────────────────────────────────────────────── */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ICI = dirname(fileURLToPath(import.meta.url));
const WRANGLER = join(ICI, "..", "..", "wrangler.toml");

/** Lit une variable de la section [vars]. Renvoie "" si absente ou vide. */
function lireVar(toml, nom) {
  const m = toml.match(new RegExp(`^${nom}\\s*=\\s*"([^"]*)"`, "m"));
  return m ? m[1].trim() : "";
}

export default function () {
  let toml = "";
  try {
    toml = readFileSync(WRANGLER, "utf8");
  } catch {
    // Pas de wrangler.toml lisible : on suppose non configuré plutôt que de
    // proposer un paiement qui échouera. Le défaut sûr est de ne pas vendre.
    return { configure: false, environnement: "test" };
  }

  const tpe = lireVar(toml, "MONETICO_TPE");
  const societe = lireVar(toml, "MONETICO_SOCIETE");
  const environnement = lireVar(toml, "MONETICO_ENV") || "test";

  // ⚠ Garde-fou. Passer MONETICO_ENV à "production" est le geste qui met la
  // boutique en encaissement réel. Le faire sans identifiants produirait un
  // site qui se croit en production, masque son bouton CB, et laisse penser
  // que le paiement est actif alors qu'aucune vente ne peut aboutir.
  // Mieux vaut refuser de construire que déployer cette ambiguïté.
  if (environnement.toLowerCase() === "production" && !(tpe && societe)) {
    throw new Error(
      "wrangler.toml : MONETICO_ENV vaut \"production\" mais MONETICO_TPE ou " +
      "MONETICO_SOCIETE est vide. Renseigner les deux, ou repasser en \"test\".",
    );
  }

  return {
    configure: Boolean(tpe && societe),
    environnement,
    // `true` quand le paiement fonctionne mais contre la plateforme de test
    // de Monetico : aucun débit réel. Utile pour afficher un avertissement
    // au commerçant pendant la recette bancaire.
    recette: Boolean(tpe && societe) && environnement.toLowerCase() !== "production",
  };
}
