/**
 * scripts/build-catalog-index.js
 * Lit src/data-source/produits/ (un fichier JSON par produit)
 * et génère functions/_shared/catalog-index.js
 *
 * Structure du catalogue généré :
 *   CATALOG["product-id"]            → prix de base (float)
 *   CATALOG["product-id::label"]     → prix de variante (float)
 *
 * Utilisé côté Workers pour valider les prix envoyés par le client.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PRODUITS_DIR = join(ROOT, "src/data-source/produits");

/**
 * Réglages du site. Lu ici, en tête, parce que deux fichiers générés en
 * dépendent : le catalogue (seuils d'alerte) et les modes de livraison.
 */
const site = JSON.parse(readFileSync(join(ROOT, "src/_data/site.json"), "utf-8"));

/** Seuils d'alerte par unité, avec un repli si site.json ne les déclare pas. */
const seuilsAlerte = { pcs: 3, g: 30, ...(site.stocks?.seuilAlerte || {}) };

// Les produits retirés de la vente ("actif": false) sortent du catalogue de
// prix : sans ça, ils resteraient commandables par appel direct à l'API, même
// sans page ni lien sur le site.
const tousProduits = readdirSync(PRODUITS_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(PRODUITS_DIR, f), "utf-8")));

const produits = tousProduits.filter((p) => p.actif !== false);
const retires = tousProduits.length - produits.length;

const entries = {};
const stocks = {};
const avecVariantes = [];

/**
 * Où et combien prélever pour chaque article vendable.
 *
 * Deux modèles coexistent :
 *  · à l'unité   — une variante a son propre stock, on en retire 1 par article
 *  · au poids    — le stock est en grammes au niveau du produit ; une variante
 *                  « 4g » en retire 4 par article. C'est le cas des fleurs CBD,
 *                  pesées à la commande depuis un vrac.
 */
const clesStock = {};

/**
 * Unité de chaque ligne de stock : « g » pour un vrac pesé, « pcs » sinon.
 * Sert aux écrans (inventaire, fiche produit) à afficher « 250 g » plutôt
 * que « 250 disponibles ».
 * @type {Record<string, string>}
 */
const unitesStock = {};

/**
 * Fiche minimale de chaque ligne de stock, pour l'appariement d'un bon de
 * livraison : le serveur doit pouvoir rapprocher « AMNES. HYDRO IND. » d'un
 * produit sans lire le catalogue complet.
 * @type {Array<{cle: string, nom: string, marque: string, categorie: string, unite: string}>}
 */
const referencesStock = [];

/**
 * Nom lisible par clé de stock. Rempli en même temps que `referencesStock`,
 * dont il est l'index — la même information, mais consultable sans parcourir
 * 121 entrées à chaque e-mail.
 */
const nomsStock = {};

/** Nombre de grammes d'un libellé de variante : « 4g » → 4. */
const grammesDe = (label) => {
  const m = String(label).match(/^([\d.,]+)\s*g$/i);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
};

// Un stock absent est traité comme 0 : mieux vaut refuser une vente que
// promettre un produit qu'on n'a pas.
const stockDe = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);

for (const p of produits) {
  if (!p.id) continue;

  // Prix de base
  entries[p.id] = Number(p.prix);

  // Un produit vendu au poids tient son stock en grammes, au niveau du produit :
  // ses variantes puisent dans le même vrac.
  const auPoids = p.unitePrix === "g" && Array.isArray(p.variantes) && p.variantes.length;

  if (auPoids) {
    stocks[p.id] = stockDe(p.stock);
    unitesStock[p.id] = "g";
    referencesStock.push({ cle: p.id, nom: p.nom || p.id, marque: p.marque || "",
                           categorie: p.categorie || "", unite: "g" });
  } else {
    stocks[p.id] = stockDe(p.stock);
    clesStock[p.id] = { cle: p.id, facteur: 1, unite: "pcs" };
    unitesStock[p.id] = "pcs";
    // Un produit décliné en variantes vendues à l'unité tient son stock par
    // variante : c'est chaque variante qui est réceptionnable, pas le produit.
    if (!(Array.isArray(p.variantes) && p.variantes.length)) {
      referencesStock.push({ cle: p.id, nom: p.nom || p.id, marque: p.marque || "",
                             categorie: p.categorie || "", unite: "pcs" });
    }
  }

  // Prix et stock des variantes (clé : "id::label")
  if (Array.isArray(p.variantes)) {
    let n = 0;
    for (const v of p.variantes) {
      if (v.label && typeof v.prix === "number") {
        entries[`${p.id}::${v.label}`] = Number(v.prix);

        if (auPoids) {
          const g = grammesDe(v.label);
          clesStock[`${p.id}::${v.label}`] = {
            cle: p.id,
            facteur: g ?? 1,   // un libellé non numérique retombe sur 1
            unite: "g",
          };
        } else {
          stocks[`${p.id}::${v.label}`] = stockDe(v.stock);
          clesStock[`${p.id}::${v.label}`] = { cle: `${p.id}::${v.label}`, facteur: 1, unite: "pcs" };
          unitesStock[`${p.id}::${v.label}`] = "pcs";
          referencesStock.push({ cle: `${p.id}::${v.label}`, nom: `${p.nom || p.id} ${v.label}`,
                                 marque: p.marque || "", categorie: p.categorie || "", unite: "pcs" });
        }
        n++;
      }
    }
    // On mémorise les produits qui n'existent QUE sous forme de variantes :
    // pour eux, un label inconnu doit être rejeté et non retomber sur le prix
    // de base (sinon 8 g de fleur seraient facturés au tarif d'un gramme).
    if (n > 0) avecVariantes.push(p.id);
  }
}

const output = `/**
 * functions/_shared/catalog-index.js
 * ⚠ FICHIER GÉNÉRÉ AUTOMATIQUEMENT — ne pas éditer manuellement
 * Regénérer via : node scripts/build-catalog-index.js
 * (exécuté automatiquement à chaque build)
 */

// @ts-check

/** @type {Record<string, number>} */
export const CATALOG = ${JSON.stringify(entries, null, 2)};

/**
 * Stocks de référence issus du catalogue — utilisés uniquement pour semer la
 * base la première fois. Le stock vivant est en D1.
 * @type {Record<string, number>}
 */
export const STOCKS = ${JSON.stringify(stocks, null, 2)};

/**
 * Pour chaque article vendable : sur quelle clé prélever, et combien.
 *
 * Une fleur vendue au poids a un stock unique en grammes au niveau du produit.
 * Commander deux sachets de 4 g retire 8 g de ce vrac — et rend donc
 * indisponibles les sachets de 8 g si le reste ne suffit plus.
 *
 * @type {Record<string, {cle: string, facteur: number, unite: string}>}
 */
export const CLES_STOCK = ${JSON.stringify(clesStock, null, 2)};

/**
 * Résout l'article en une opération de stock.
 * @returns {{cle: string, facteur: number, unite: string}}
 */
/**
 * Unité de chaque ligne de stock.
 * @type {Record<string, string>}
 */
export const UNITES_STOCK = ${JSON.stringify(unitesStock, null, 2)};

/**
 * Toutes les lignes de stock réceptionnables, avec de quoi les reconnaître
 * sur un bon de livraison. Généré depuis le catalogue : une référence retirée
 * de la vente n'y figure pas.
 * @type {Array<{cle: string, nom: string, marque: string, categorie: string, unite: string}>}
 */
export const REFERENCES = ${JSON.stringify(referencesStock, null, 2)};

/**
 * Unité d'une ligne de stock — « g » ou « pcs ».
 * Une clé inconnue est comptée en pièces : c'est le cas le plus courant.
 */
export function uniteStock(cle) {
  return UNITES_STOCK[String(cle)] || "pcs";
}

/**
 * Seuils d'alerte, par unité.
 *
 * Un seuil unique serait faux, et faux du mauvais côté. Trois boîtes de
 * résistances, c'est une alerte légitime. Trois grammes de fleur, c'est
 * qu'il ne reste plus rien depuis longtemps — et surtout, une fleur à 20 g
 * ne déclencherait rien alors qu'elle ne peut déjà plus honorer trois
 * sachets de 8 g. L'alerte arriverait trop tard précisément sur les
 * références qui tournent le plus.
 *
 * Source de vérité : src/_data/site.json → "stocks.seuilAlerte".
 * @type {Record<string, number>}
 */
export const SEUILS_ALERTE = ${JSON.stringify(seuilsAlerte, null, 2)};

/**
 * Nom lisible de chaque ligne de stock.
 *
 * Le libellé existe aussi en base, mais il y est figé au semis : un produit
 * renommé garderait son ancien nom dans les e-mails. Celui-ci suit le
 * catalogue.
 * @type {Record<string, string>}
 */
export const NOMS_STOCK = ${JSON.stringify(nomsStock, null, 2)};

/** Nom lisible d'une clé de stock, avec repli sur la clé elle-même. */
export function nomStock(cle) {
  const k = String(cle);
  return NOMS_STOCK[k] || NOMS_STOCK[k.split("::")[0]] || k;
}

/** Seuil en dessous duquel une ligne de stock demande un réassort. */
export function seuilAlerte(cle) {
  return SEUILS_ALERTE[uniteStock(cle)] ?? 3;
}

/** Cette quantité est-elle basse pour cette référence ? Zéro est une rupture, pas un stock faible. */
export function stockFaible(cle, dispo) {
  return dispo > 0 && dispo <= seuilAlerte(cle);
}

export function resoudreStock(id, label) {
  const k = label ? \`\${id}::\${label}\` : String(id);
  return CLES_STOCK[k] || { cle: String(id), facteur: 1, unite: "pcs" };
}

/**
 * Produits déclinés en variantes (grammages, saveurs).
 * Pour ceux-là, un label absent du catalogue est une erreur, pas un cas de repli.
 * @type {Set<string>}
 */
export const PRODUITS_A_VARIANTES = new Set(${JSON.stringify(avecVariantes, null, 2)});

/**
 * Renvoie le prix serveur vérifié pour un article du panier.
 *
 * Règles :
 *  - label connu           → prix de la variante
 *  - label inconnu sur un produit à variantes → null (article rejeté)
 *  - pas de label          → prix de base, si le produit en a un
 *
 * @param {string} id          - ID produit (slug)
 * @param {string|null} label  - Label de variante (ou null pour le prix de base)
 * @returns {number|null}       - Prix TTC en euros, ou null si introuvable
 */
export function lookupPrice(id, label) {
  if (label) {
    const key = \`\${id}::\${label}\`;
    if (key in CATALOG) return CATALOG[key];
    // Label fourni mais inconnu : on refuse plutôt que de facturer le prix de base
    if (PRODUITS_A_VARIANTES.has(id)) return null;
  }
  if (id in CATALOG) return CATALOG[id];
  return null;
}

/**
 * Quantité disponible pour un article, variante comprise.
 *
 * Un article inconnu renvoie 0 plutôt que null : l'appelant n'a pas à
 * distinguer « inconnu » de « épuisé », les deux interdisent la vente.
 *
 * @param {string} id
 * @param {string|null} label
 * @returns {number} quantité commandable, 0 si indisponible
 */
export function lookupStock(id, label) {
  if (label) {
    const key = \`\${id}::\${label}\`;
    if (key in STOCKS) return STOCKS[key];
    if (PRODUITS_A_VARIANTES.has(id)) return 0;
  }
  return id in STOCKS ? STOCKS[id] : 0;
}
`;

mkdirSync(join(ROOT, "functions/_shared"), { recursive: true });
for (const r of referencesStock) nomsStock[r.cle] = r.nom;

writeFileSync(join(ROOT, "functions/_shared/catalog-index.js"), output, "utf-8");

const count = Object.keys(entries).length;
console.log(
  `[catalog] ✓ ${count} entrées générées depuis ${produits.length} produits actifs` +
  (retires ? ` (${retires} retiré${retires > 1 ? "s" : ""} de la vente)` : "") +
  ` → functions/_shared/catalog-index.js`
);

/* ───────────────────────────────────────────────────────────────────────────
 * Modes de livraison — généré depuis src/_data/site.json
 *
 * Les mêmes valeurs alimentent les templates (via site.livraison.modes) et les
 * Workers (via ce fichier). Impossible de les faire diverger : elles ont une
 * seule source. Modifier un tarif ou un délai = éditer site.json, puis rebuild.
 * ─────────────────────────────────────────────────────────────────────────── */
const modes = site.livraison?.modes;

if (!modes || typeof modes !== "object" || !Object.keys(modes).length) {
  throw new Error("[livraison] site.json doit contenir livraison.modes (objet non vide)");
}

for (const [id, m] of Object.entries(modes)) {
  if (typeof m.fraisPort !== "number") {
    throw new Error(`[livraison] mode "${id}" : fraisPort doit être un nombre`);
  }
  if (m.seuilGratuit !== null && typeof m.seuilGratuit !== "number") {
    throw new Error(`[livraison] mode "${id}" : seuilGratuit doit être un nombre ou null`);
  }
  if (!["creneau", "adresse", "point"].includes(m.saisie)) {
    throw new Error(`[livraison] mode "${id}" : saisie doit valoir creneau, adresse ou point`);
  }
}

/* ───────────────────────────────────────────────────────────────────────────
 * Créneaux de retrait, dérivés des horaires d'ouverture
 *
 * Le dernier créneau d'une plage se termine à l'heure de fermeture, jamais
 * avant : une commande reste retirable jusqu'à ce que la boutique ferme.
 * Un reliquat trop court est absorbé par le créneau précédent plutôt que de
 * créer une tranche de quelques minutes.
 * ─────────────────────────────────────────────────────────────────────────── */
const cc = modes["click-and-collect"] || {};
const DUREE = cc.dureeCreneauMinutes ?? 90;
const RELIQUAT_MIN = 45; // en deçà, on rallonge le créneau précédent

const enMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const enTexte = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
};

function creneauxDePlage([ouverture, fermeture]) {
  const debut = enMinutes(ouverture), fin = enMinutes(fermeture);
  const bornes = [];
  for (let t = debut; t < fin; t += DUREE) bornes.push(t);

  return bornes.map((t, i) => {
    const suivant = bornes[i + 1];
    // Dernier créneau, ou avant-dernier si le reliquat est trop court
    const estDernier = suivant === undefined || (fin - suivant) < RELIQUAT_MIN;
    return {
      value: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`,
      label: `${enTexte(t)} – ${enTexte(estDernier ? fin : suivant)}`,
      _fin: estDernier ? fin : suivant,
    };
  }).filter((c, i, arr) => {
    // Un créneau absorbé par le précédent ne doit pas réapparaître
    const precedent = arr[i - 1];
    return !precedent || enMinutes(c.value) >= precedent._fin;
  }).map(({ value, label }) => ({ value, label }));
}

const horaires = cc.horairesRetrait || {};
const creneaux = {};
for (const [jour, plages] of Object.entries(horaires)) {
  creneaux[jour] = plages.flatMap(creneauxDePlage);
}

const livraisonOutput = `/**
 * functions/_shared/livraison.js
 * ⚠ FICHIER GÉNÉRÉ AUTOMATIQUEMENT — ne pas éditer manuellement
 * Source de vérité : src/_data/site.json → "livraison.modes"
 * Regénérer via : node scripts/build-catalog-index.js
 */

// @ts-check

/**
 * Modes de livraison proposés, indexés par identifiant.
 * \`saisie\` indique ce que le client doit renseigner :
 *   "creneau" → date et heure de retrait en boutique
 *   "adresse" → adresse postale complète
 *   "point"   → identité d'un point retrait ou d'une consigne
 * \`actif\` à false = mode connu mais pas encore ouvert à la vente.
 */
export const MODES = ${JSON.stringify(modes, null, 2)};

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
export const CRENEAUX = ${JSON.stringify(creneaux, null, 2)};

/** Créneaux d'un jour donné (0 = dimanche). */
export function creneauxDuJour(jour) {
  return CRENEAUX[String(jour)] || [];
}

/** Cette heure de début est-elle un créneau valide ce jour-là ? */
export function creneauValide(jour, heure) {
  return creneauxDuJour(jour).some((c) => c.value === heure);
}
`;

writeFileSync(join(ROOT, "functions/_shared/livraison.js"), livraisonOutput, "utf-8");

const actifs = Object.entries(modes).filter(([, m]) => m.actif).map(([id]) => id);
const inactifs = Object.entries(modes).filter(([, m]) => !m.actif).map(([id]) => id);
console.log(
  `[livraison] ✓ ${Object.keys(modes).length} modes → functions/_shared/livraison.js\n` +
  `            actifs   : ${actifs.join(", ") || "aucun"}\n` +
  `            inactifs : ${inactifs.join(", ") || "aucun"}`
);
