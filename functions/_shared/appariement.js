/**
 * functions/_shared/appariement.js
 * Rapprocher une ligne de bon de livraison d'une référence du catalogue.
 *
 * ─── Le problème ──────────────────────────────────────────────────────────
 * Le fournisseur écrit « AMNES. HYDRO IND. 500G », le catalogue dit
 * « Amnésia Hydro Indoor CBD ». Aucun rapprochement automatique ne sera
 * parfait du premier coup, et prétendre le contraire ferait entrer du stock
 * sur le mauvais produit — l'erreur la plus coûteuse à rattraper.
 *
 * ─── Le principe ──────────────────────────────────────────────────────────
 * Le système ne devine qu'une fois, ensuite il se souvient. Une association
 * validée par le commerçant est enregistrée (table `alias_fournisseur`) :
 * à la livraison suivante, la même ligne est reconnue sans calcul et sans
 * doute. La similarité n'est qu'un filet pour la première fois.
 *
 * Trois niveaux de confiance sont renvoyés, jamais une réponse unique :
 *   certain    — alias déjà validé, ou libellé identique au catalogue
 *   probable   — bonne similarité ET nettement devant le second candidat
 *   incertain  — le commerçant doit choisir
 * ─────────────────────────────────────────────────────────────────────────── */

// @ts-check

import { REFERENCES } from "./catalog-index.js";

/**
 * Mots qui n'aident pas à distinguer deux produits et brouillent la mesure :
 * ils apparaissent partout sur les bons de livraison.
 */
const BRUIT = new Set([
  "cbd", "le", "la", "les", "de", "du", "des", "un", "une", "et", "au", "aux",
  "pcs", "pc", "piece", "pieces", "unite", "unites", "sachet", "sachets",
  "boite", "boites", "pot", "pots", "carton", "cartons", "lot", "ref",
  "qte", "quantite", "produit", "article",
]);

/**
 * Normalise un libellé : minuscules, sans accents, sans ponctuation.
 * C'est cette forme qui sert de clé aux alias — donc elle ne doit jamais
 * changer sans migration, sous peine de perdre la mémoire accumulée.
 */
export function normaliser(texte) {
  return String(texte || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // accents
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Mots significatifs d'un libellé : sans le bruit, et sans les quantités.
 * « amnesia hydro ind 500g » et « amnesia hydro indoor » doivent se
 * ressembler ; le « 500g » du conditionnement ne doit pas peser dans la
 * balance, sinon deux produits différents livrés en 500 g se confondent.
 */
function motsUtiles(texte) {
  return normaliser(texte)
    .split(" ")
    .filter((m) => m && !BRUIT.has(m) && !/^\d+(g|kg|mg|ml|l|x)?$/.test(m));
}

/** Trigrammes d'une chaîne, pour comparer des libellés abrégés. */
function trigrammes(s) {
  const t = ` ${s} `;
  const out = new Set();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** Coefficient de Dice : 0 = étrangers, 1 = identiques. */
function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let communs = 0;
  for (const x of a) if (b.has(x)) communs++;
  return (2 * communs) / (a.size + b.size);
}

/**
 * Score de ressemblance entre un libellé de bon et une référence.
 *
 * Deux mesures se complètent : les trigrammes encaissent les abréviations
 * (« amnes. » ≈ « amnesia »), les mots entiers évitent qu'un simple air de
 * famille orthographique l'emporte sur un vrai mot en commun.
 */
function score(motsBon, triBon, ref) {
  const triRef = trigrammes(ref._norm);
  const parTrigrammes = dice(triBon, triRef);

  const motsRef = new Set(ref._mots);
  let communs = 0;
  for (const m of motsBon) if (motsRef.has(m)) communs++;
  const parMots = motsBon.length ? communs / Math.max(motsBon.length, motsRef.size) : 0;

  let s = 0.55 * parTrigrammes + 0.45 * parMots;

  // La marque n'identifie pas un produit à elle seule, mais elle départage
  // deux produits au nom voisin vendus par des fournisseurs différents.
  if (ref._marque && motsBon.some((m) => ref._marque.includes(m))) s += 0.05;

  return Math.min(1, s);
}

/** Index préparé une fois par isolat, pas à chaque ligne. */
let INDEX = null;
function index() {
  if (INDEX) return INDEX;
  INDEX = REFERENCES.map((r) => ({
    ...r,
    _norm: normaliser(`${r.marque} ${r.nom}`),
    _mots: motsUtiles(`${r.marque} ${r.nom}`),
    _marque: normaliser(r.marque),
  }));
  return INDEX;
}

/** Libellé lisible d'une référence, pour l'écran de validation. */
function libelleRef(r) {
  return r.marque && !r.nom.toLowerCase().startsWith(r.marque.toLowerCase())
    ? `${r.marque} ${r.nom}` : r.nom;
}

const SEUIL_PROBABLE = 0.62;   // en dessous, on ne propose rien de ferme
const ECART_MINIMAL  = 0.10;   // avance requise sur le second candidat

/**
 * Rapproche une ligne de bon de livraison du catalogue.
 *
 * @param {string} libelle  Le texte lu sur le bon
 * @param {Record<string, {cle: string, vus: number}>} alias  Alias mémorisés
 * @returns {{cle: string|null, confiance: 'certain'|'probable'|'incertain',
 *            score: number, candidats: Array<{cle: string, libelle: string, unite: string, score: number}>}}
 */
export function apparier(libelle, alias = {}) {
  const norme = normaliser(libelle);
  const refs = index();

  // 1 — Déjà vu : aucune incertitude, et aucun calcul.
  const connu = alias[norme];
  if (connu) {
    const r = refs.find((x) => x.cle === connu.cle);
    if (r) {
      return { cle: r.cle, confiance: "certain", score: 1,
               candidats: [{ cle: r.cle, libelle: libelleRef(r), unite: r.unite, score: 1 }] };
    }
    // L'alias vise une référence disparue du catalogue : on l'ignore et on
    // retombe sur la similarité plutôt que de proposer un produit inexistant.
  }

  // 2 — Libellé identique au catalogue.
  const exact = refs.find((r) => r._norm === norme);
  if (exact) {
    return { cle: exact.cle, confiance: "certain", score: 1,
             candidats: [{ cle: exact.cle, libelle: libelleRef(exact), unite: exact.unite, score: 1 }] };
  }

  // 3 — Similarité.
  const motsBon = motsUtiles(libelle);
  const triBon  = trigrammes(norme);

  const classes = refs
    .map((r) => ({ r, s: score(motsBon, triBon, r) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);

  const candidats = classes.map(({ r, s }) => ({
    cle: r.cle, libelle: libelleRef(r), unite: r.unite, score: Math.round(s * 100) / 100,
  }));

  const meilleur = classes[0];
  const second   = classes[1];
  if (!meilleur) return { cle: null, confiance: "incertain", score: 0, candidats: [] };

  const detache = !second || meilleur.s - second.s >= ECART_MINIMAL;
  const sur = meilleur.s >= SEUIL_PROBABLE && detache;

  return {
    cle: sur ? meilleur.r.cle : null,
    confiance: sur ? "probable" : "incertain",
    score: Math.round(meilleur.s * 100) / 100,
    candidats,
  };
}

/**
 * Convertit la quantité du bon vers l'unité de stock de la référence.
 *
 * Les fleurs se tiennent en grammes : un bon qui annonce « 0,5 kg » doit
 * entrer 500. Un bon qui annonce des pièces sur une référence au poids est
 * une ambiguïté réelle (combien pèse un pot ?) — on ne devine pas, on
 * signale.
 *
 * @returns {{quantite: number|null, unite: string, ambigu?: string}}
 */
export function convertirQuantite(quantite, uniteBon, uniteCible) {
  const n = Number(String(quantite).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) {
    return { quantite: null, unite: uniteCible, ambigu: "Quantité illisible" };
  }

  const u = normaliser(uniteBon);
  const enGrammes = { kg: 1000, kgs: 1000, kilo: 1000, kilos: 1000, kilogramme: 1000,
                      g: 1, gr: 1, gramme: 1, grammes: 1, mg: 0.001 };

  if (uniteCible === "g") {
    if (u in enGrammes) return { quantite: Math.round(n * enGrammes[u]), unite: "g" };
    if (!u) return { quantite: Math.round(n), unite: "g", ambigu: "Unité absente du bon — lue comme des grammes" };
    return { quantite: null, unite: "g",
             ambigu: `« ${uniteBon} » n'est pas un poids : indiquer les grammes à la main` };
  }

  // Référence à l'unité : un poids n'a pas de sens, on le signale.
  if (u in enGrammes) {
    return { quantite: null, unite: "pcs",
             ambigu: `Le bon donne un poids (${uniteBon}) pour un produit vendu à l'unité` };
  }
  return { quantite: Math.round(n), unite: "pcs" };
}
