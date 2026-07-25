/**
 * functions/_shared/valide-livraison.js
 * Validation serveur du mode de livraison et des informations qu'il exige.
 *
 * Écrit à la main — ne pas confondre avec livraison.js, qui est généré depuis
 * src/_data/site.json et ne contient que les tarifs et les métadonnées.
 *
 * Utilisé par create-payment.js et submit-reservation.js pour que les deux
 * parcours appliquent exactement les mêmes règles. Rien de ce qui vient du
 * client n'est repris sans contrôle.
 */

import { MODES, modeValide, besoinCreneau, besoinAdresse, besoinPointRetrait, libelle, creneauValide } from "./livraison.js";

const CC = MODES["click-and-collect"] || {};

/** Délai minimum entre la commande et le retrait, en minutes. */
const DELAI_PREPARATION_MIN = CC.delaiPreparationMinutes ?? 60;

/** Nombre de jours à l'avance maximum pour réserver un créneau. */
const HORIZON_JOURS = CC.horizonJours ?? 30;

/**
 * Convertit une date-heure murale d'Europe/Paris en minutes comparables.
 *
 * Les Workers tournent en UTC : comparer directement des Date() donnerait un
 * décalage d'une à deux heures selon la saison, et un client pourrait réserver
 * un créneau déjà passé. On ramène donc les deux côtés à l'heure murale
 * parisienne, où la différence en minutes est la différence réelle.
 *
 * @param {Date} instant
 * @returns {number} minutes depuis une origine arbitraire, en heure de Paris
 */
function minutesParis(instant) {
  const p = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(instant).reduce((a, x) => (a[x.type] = x.value, a), {});

  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) / 60000;
}

/** Même échelle, à partir d'une date « AAAA-MM-JJ » et d'une heure « HH:MM ». */
function minutesCreneau(date, heure) {
  const [a, m, j] = date.split("-").map(Number);
  const [h, min]  = heure.split(":").map(Number);
  return Date.UTC(a, m - 1, j, h, min) / 60000;
}

/** Transporteurs autorisés pour un point retrait. */
const TRANSPORTEURS_POINT = new Set(["colissimo", "mondial-relay"]);

const texte = (v, max) =>
  typeof v === "string" && v.trim().length > 0 && v.trim().length <= max
    ? v.trim()
    : null;

/**
 * Valide le mode de livraison et normalise les données associées.
 *
 * @param {object} body - Corps de la requête client
 * @returns {{ erreur: string } | { mode: string, creneauRetrait: object|null,
 *            adresseLivraison: object|null, pointRetrait: object|null }}
 */
export function valideLivraison(body) {
  const mode = body?.modeLivraison || "click-and-collect";

  if (!modeValide(mode)) {
    return { erreur: "Mode de livraison indisponible : " + mode };
  }

  const resultat = {
    mode,
    creneauRetrait: null,
    adresseLivraison: null,
    pointRetrait: null,
  };

  // ── Retrait en boutique : créneau ────────────────────────────────────────
  if (besoinCreneau(mode)) {
    const c = body.creneauRetrait;
    if (!c?.date || !c?.heure) return { erreur: "Créneau de retrait manquant" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date)) return { erreur: "Format de date invalide" };
    if (!/^\d{2}:\d{2}$/.test(c.heure)) return { erreur: "Format d'heure invalide" };

    const retrait = new Date(c.date + "T00:00:00Z");
    if (isNaN(retrait.getTime())) return { erreur: "Date invalide" };

    // Les créneaux dépendent du jour : la boutique n'ouvre pas aux mêmes heures
    // le dimanche et le samedi. getUTCDay() est correct ici, la date ayant été
    // construite en UTC à minuit.
    if (!creneauValide(retrait.getUTCDay(), c.heure)) {
      return { erreur: "Créneau horaire non proposé ce jour-là" };
    }

    // Le retrait le jour même est autorisé, à condition de laisser à la
    // boutique le temps de préparer la commande.
    const maintenant = minutesParis(new Date());
    const creneau    = minutesCreneau(c.date, c.heure);

    if (creneau < maintenant + DELAI_PREPARATION_MIN) {
      return {
        erreur: `Ce créneau est trop proche. Comptez ${DELAI_PREPARATION_MIN} minutes de préparation.`,
      };
    }

    if (creneau > maintenant + HORIZON_JOURS * 24 * 60) {
      return { erreur: `Date de retrait trop lointaine (max ${HORIZON_JOURS} jours)` };
    }

    resultat.creneauRetrait = { date: c.date, heure: c.heure };
    return resultat;
  }

  // ── Livraison à domicile : adresse postale ───────────────────────────────
  if (besoinAdresse(mode)) {
    const a = body.adresseLivraison;
    const adresse = texte(a?.adresse, 200);
    const ville = texte(a?.ville, 100);

    if (!adresse) return { erreur: "Adresse de livraison manquante ou trop longue" };
    if (!ville) return { erreur: "Ville manquante ou trop longue" };
    if (!/^\d{5}$/.test(String(a?.codePostal || "").trim())) {
      return { erreur: "Code postal invalide (5 chiffres attendus)" };
    }

    resultat.adresseLivraison = {
      adresse,
      codePostal: String(a.codePostal).trim(),
      ville,
    };
    return resultat;
  }

  // ── Point retrait ou consigne ────────────────────────────────────────────
  if (besoinPointRetrait(mode)) {
    const p = body.pointRetrait;
    if (!p) return { erreur: `Aucun point de retrait choisi pour « ${libelle(mode)} »` };

    const transporteurId = String(p.transporteur || "").trim().toLowerCase();
    if (!TRANSPORTEURS_POINT.has(transporteurId)) {
      return { erreur: "Transporteur de point retrait inconnu" };
    }

    // L'identifiant est ce qui figurera sur l'étiquette : il doit être exploitable.
    const id = texte(p.id, 32);
    if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) {
      return { erreur: "Identifiant de point retrait invalide" };
    }

    const nom = texte(p.nom, 120);
    const ville = texte(p.ville, 100);
    if (!nom) return { erreur: "Nom du point de retrait manquant" };
    if (!ville) return { erreur: "Ville du point de retrait manquante" };
    if (!/^\d{5}$/.test(String(p.cp || "").trim())) {
      return { erreur: "Code postal du point de retrait invalide" };
    }

    resultat.pointRetrait = {
      transporteur: transporteurId,
      id,
      nom,
      adresse: texte(p.adresse, 200) || "",
      cp: String(p.cp).trim(),
      ville,
    };
    return resultat;
  }

  return { erreur: "Mode de livraison non pris en charge : " + mode };
}
