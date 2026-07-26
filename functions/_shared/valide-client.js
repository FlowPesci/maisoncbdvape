/**
 * functions/_shared/valide-client.js
 * Validation et normalisation des coordonnées client.
 *
 * ─── Pourquoi ce module ───────────────────────────────────────────────────
 * Deux chemins créent une commande — `create-payment` (paiement en ligne) et
 * `submit-reservation` (retrait en boutique) — et ils ne validaient pas la
 * même chose. `submit-reservation` contrôlait nom, e-mail et téléphone ;
 * `create-payment` se contentait de vérifier que `client.email` existait,
 * puis appelait `client.nom.trim()` — un corps sans `nom` provoquait une
 * erreur 500 au lieu d'un refus propre.
 *
 * Une seule règle, un seul endroit. Ne pas revalider ailleurs : c'est ainsi
 * que les deux chemins avaient divergé.
 *
 * ─── Longueurs maximales ──────────────────────────────────────────────────
 * Sans plafond, un envoi de plusieurs mégaoctets est stocké tel quel en KV
 * et recopié dans les e-mails. On tronque plutôt que de refuser : un nom
 * trop long est une maladresse, pas une attaque, et refuser une commande
 * pour cette raison coûte une vente.
 * ─────────────────────────────────────────────────────────────────────────── */

// @ts-check

/** Un nom de famille composé tient largement dans 120 caractères. */
const MAX_NOM       = 120;
const MAX_EMAIL     = 254;   // RFC 5321
const MAX_TELEPHONE = 30;
const MAX_NOTES     = 1000;

/** Coupe proprement et retire les espaces superflus. */
function borner(valeur, max) {
  return String(valeur ?? "").trim().slice(0, max);
}

/**
 * Valide les coordonnées client et renvoie une version normalisée.
 *
 * @param {any} client
 * @returns {{erreur: string} | {erreur: null, client: {nom: string, email: string, telephone: string, notes: string}}}
 */
export function valideClient(client) {
  const nom       = borner(client?.nom, MAX_NOM);
  const email     = borner(client?.email, MAX_EMAIL).toLowerCase();
  const telephone = borner(client?.telephone, MAX_TELEPHONE);
  const notes     = borner(client?.notes, MAX_NOTES);

  if (nom.length < 2) return { erreur: "Nom invalide" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erreur: "Email invalide" };
  if (!/^[0-9 +.\-()]{8,}$/.test(telephone)) return { erreur: "Téléphone invalide" };

  return { erreur: null, client: { nom, email, telephone, notes } };
}
