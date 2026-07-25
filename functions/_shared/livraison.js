/**
 * functions/_shared/livraison.js
 * ⚠ FICHIER GÉNÉRÉ AUTOMATIQUEMENT — ne pas éditer manuellement
 * Source de vérité : src/_data/site.json → "livraison.modes"
 * Regénérer via : node scripts/build-catalog-index.js
 */

// @ts-check

/**
 * Modes de livraison proposés, indexés par identifiant.
 * `saisie` indique ce que le client doit renseigner :
 *   "creneau" → date et heure de retrait en boutique
 *   "adresse" → adresse postale complète
 *   "point"   → identité d'un point retrait ou d'une consigne
 * `actif` à false = mode connu mais pas encore ouvert à la vente.
 */
export const MODES = {
  "click-and-collect": {
    "libelle": "Click & Collect",
    "accroche": "Prêt en 1 heure, retrait à Gex",
    "transporteur": null,
    "fraisPort": 0,
    "seuilGratuit": null,
    "delai": "1 heure",
    "saisie": "creneau",
    "actif": true,
    "delaiPreparationMinutes": 60,
    "horizonJours": 30,
    "dureeCreneauMinutes": 90,
    "horairesRetrait": {
      "0": [
        [
          "08:00",
          "12:00"
        ]
      ],
      "1": [
        [
          "07:30",
          "12:30"
        ],
        [
          "14:00",
          "19:00"
        ]
      ],
      "2": [
        [
          "07:30",
          "12:30"
        ],
        [
          "14:00",
          "19:00"
        ]
      ],
      "3": [
        [
          "07:30",
          "12:00"
        ],
        [
          "14:00",
          "19:00"
        ]
      ],
      "4": [
        [
          "07:30",
          "12:30"
        ],
        [
          "14:00",
          "19:00"
        ]
      ],
      "5": [
        [
          "07:30",
          "12:30"
        ],
        [
          "14:00",
          "19:00"
        ]
      ],
      "6": [
        [
          "08:00",
          "12:30"
        ],
        [
          "14:00",
          "18:40"
        ]
      ]
    }
  },
  "livraison": {
    "libelle": "Livraison à domicile",
    "accroche": "Partout en France métropolitaine",
    "transporteur": "Colissimo",
    "fraisPort": 4.9,
    "seuilGratuit": 49.9,
    "delai": "48h",
    "saisie": "adresse",
    "actif": true
  },
  "point-retrait": {
    "libelle": "Point retrait",
    "accroche": "Bureau de Poste, commerce ou consigne Pickup",
    "transporteur": "Colissimo Pickup",
    "fraisPort": 3.9,
    "seuilGratuit": 49.9,
    "delai": "48h",
    "saisie": "point",
    "actif": false
  },
  "consigne": {
    "libelle": "Consigne 24h/24",
    "accroche": "Casier automatique, retrait par code",
    "transporteur": "Mondial Relay",
    "fraisPort": 4.5,
    "seuilGratuit": 49.9,
    "delai": "3 jours ouvrés",
    "saisie": "point",
    "actif": false,
    "widget": {
      "type": "mondial-relay",
      "brand": "BDTEST",
      "colLivMod": "APM",
      "theme": "mondialrelay",
      "pays": "FR",
      "codePostalDefaut": "01170",
      "nbResultats": 10
    }
  }
};

/** Un mode existe-t-il et est-il ouvert à la vente ? */
export function modeValide(mode) {
  const m = MODES[mode];
  return Boolean(m && m.actif);
}

/** Ce mode exige-t-il que le client ait choisi un point retrait ? */
export function besoinPointRetrait(mode) {
  return MODES[mode]?.saisie === "point";
}

/** Ce mode exige-t-il une adresse postale ? */
export function besoinAdresse(mode) {
  return MODES[mode]?.saisie === "adresse";
}

/** Ce mode exige-t-il un créneau de retrait en boutique ? */
export function besoinCreneau(mode) {
  return MODES[mode]?.saisie === "creneau";
}

/**
 * Frais de port applicables à une commande.
 *
 * Un mode inconnu renvoie 0 : la validation du mode est faite en amont par
 * modeValide(), on ne facture jamais sur la foi d'une valeur non reconnue.
 *
 * @param {number} sousTotal - Total TTC des articles, hors frais de port
 * @param {string} mode - Identifiant du mode de livraison
 * @returns {number} Frais de port en euros (0 si offerts)
 */
export function computeFraisPort(sousTotal, mode) {
  const m = MODES[mode];
  if (!m) return 0;
  if (!m.fraisPort) return 0;
  if (m.seuilGratuit !== null && sousTotal >= m.seuilGratuit) return 0;
  return m.fraisPort;
}

/** Transporteur d'un mode, ou chaîne vide s'il n'y en a pas. */
export function transporteur(mode) {
  return MODES[mode]?.transporteur || "";
}

/** Délai annoncé pour un mode, ou chaîne vide. */
export function delai(mode) {
  return MODES[mode]?.delai || "";
}

/** Libellé lisible d'un mode, pour les emails et le back-office. */
export function libelle(mode) {
  return MODES[mode]?.libelle || mode;
}

/**
 * Créneaux de retrait par jour de la semaine (0 = dimanche).
 * Dérivés des horaires d'ouverture : le dernier créneau d'une plage se termine
 * à l'heure de fermeture, la commande reste donc retirable jusqu'au bout.
 * @type {Record<string, {value: string, label: string}[]>}
 */
export const CRENEAUX = {
  "0": [
    {
      "value": "08:00",
      "label": "8 h – 9 h 30"
    },
    {
      "value": "09:30",
      "label": "9 h 30 – 11 h"
    },
    {
      "value": "11:00",
      "label": "11 h – 12 h"
    }
  ],
  "1": [
    {
      "value": "07:30",
      "label": "7 h 30 – 9 h"
    },
    {
      "value": "09:00",
      "label": "9 h – 10 h 30"
    },
    {
      "value": "10:30",
      "label": "10 h 30 – 12 h 30"
    },
    {
      "value": "14:00",
      "label": "14 h – 15 h 30"
    },
    {
      "value": "15:30",
      "label": "15 h 30 – 17 h"
    },
    {
      "value": "17:00",
      "label": "17 h – 19 h"
    }
  ],
  "2": [
    {
      "value": "07:30",
      "label": "7 h 30 – 9 h"
    },
    {
      "value": "09:00",
      "label": "9 h – 10 h 30"
    },
    {
      "value": "10:30",
      "label": "10 h 30 – 12 h 30"
    },
    {
      "value": "14:00",
      "label": "14 h – 15 h 30"
    },
    {
      "value": "15:30",
      "label": "15 h 30 – 17 h"
    },
    {
      "value": "17:00",
      "label": "17 h – 19 h"
    }
  ],
  "3": [
    {
      "value": "07:30",
      "label": "7 h 30 – 9 h"
    },
    {
      "value": "09:00",
      "label": "9 h – 10 h 30"
    },
    {
      "value": "10:30",
      "label": "10 h 30 – 12 h"
    },
    {
      "value": "14:00",
      "label": "14 h – 15 h 30"
    },
    {
      "value": "15:30",
      "label": "15 h 30 – 17 h"
    },
    {
      "value": "17:00",
      "label": "17 h – 19 h"
    }
  ],
  "4": [
    {
      "value": "07:30",
      "label": "7 h 30 – 9 h"
    },
    {
      "value": "09:00",
      "label": "9 h – 10 h 30"
    },
    {
      "value": "10:30",
      "label": "10 h 30 – 12 h 30"
    },
    {
      "value": "14:00",
      "label": "14 h – 15 h 30"
    },
    {
      "value": "15:30",
      "label": "15 h 30 – 17 h"
    },
    {
      "value": "17:00",
      "label": "17 h – 19 h"
    }
  ],
  "5": [
    {
      "value": "07:30",
      "label": "7 h 30 – 9 h"
    },
    {
      "value": "09:00",
      "label": "9 h – 10 h 30"
    },
    {
      "value": "10:30",
      "label": "10 h 30 – 12 h 30"
    },
    {
      "value": "14:00",
      "label": "14 h – 15 h 30"
    },
    {
      "value": "15:30",
      "label": "15 h 30 – 17 h"
    },
    {
      "value": "17:00",
      "label": "17 h – 19 h"
    }
  ],
  "6": [
    {
      "value": "08:00",
      "label": "8 h – 9 h 30"
    },
    {
      "value": "09:30",
      "label": "9 h 30 – 11 h"
    },
    {
      "value": "11:00",
      "label": "11 h – 12 h 30"
    },
    {
      "value": "14:00",
      "label": "14 h – 15 h 30"
    },
    {
      "value": "15:30",
      "label": "15 h 30 – 17 h"
    },
    {
      "value": "17:00",
      "label": "17 h – 18 h 40"
    }
  ]
};

/** Créneaux d'un jour donné (0 = dimanche). */
export function creneauxDuJour(jour) {
  return CRENEAUX[String(jour)] || [];
}

/** Cette heure de début est-elle un créneau valide ce jour-là ? */
export function creneauValide(jour, heure) {
  return creneauxDuJour(jour).some((c) => c.value === heure);
}
