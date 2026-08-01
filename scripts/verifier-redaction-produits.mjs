/**
 * scripts/verifier-redaction-produits.mjs
 * Contrôle la rédaction des fiches produits. Voir docs/charte-fiches-produits.md
 *
 *   node scripts/verifier-redaction-produits.mjs          → rapport complet
 *   node scripts/verifier-redaction-produits.mjs --strict → échoue sur tout écart
 *
 * ─── Pourquoi ce script existe ────────────────────────────────────────────
 * Deux natures de problème, et une seule mérite de casser le build.
 *
 * **Les allégations de santé sont bloquantes.** Un produit au CBD ne peut
 * porter aucune mention d'effet thérapeutique, physiologique ou de bien-être
 * — règlement (CE) 1924/2006, articles L121-2 et suivants du code de la
 * consommation. La DGCCRF sanctionne régulièrement ce point. « Effet
 * relaxant profond », « apaisement », « anti-stress » : ces formules
 * exposent la boutique, et elles s'écrivent toutes seules quand on reprend
 * la fiche d'un fournisseur.
 *
 * C'est la même famille de risque que les faux avis retirés le 2026-08-01 :
 * invisible à la relecture, coûteux au contrôle.
 *
 * **Le reste est signalé, pas bloqué.** Longueur, emojis, entités HTML,
 * champs vides : ce sont des défauts de qualité. Les rendre bloquants
 * empêcherait de publier un produit reçu ce matin. Le mode `--strict` sert
 * quand on veut vérifier qu'un lot réécrit respecte bien la charte.
 * ─────────────────────────────────────────────────────────────────────────── */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "src/data-source/produits";
const STRICT = process.argv.includes("--strict");

/**
 * Vocabulaire interdit sur un produit destiné à la consommation.
 *
 * ⚠ Ne pas alléger cette liste pour faire passer une fiche. Si un mot y
 * figure à tort, c'est la formulation qu'il faut revoir : la charte propose
 * une tournure sensorielle équivalente pour chaque cas.
 */
const ALLEGATIONS = [
  { motif: /relax\w*/gi,                        pourquoi: "effet physiologique" },
  { motif: /apais\w*/gi,                        pourquoi: "effet physiologique" },
  { motif: /s[ée]r[ée]nit[ée]|serein\w*/gi,     pourquoi: "effet psychologique" },
  { motif: /anti[- ]?stress|d[ée]stress\w*/gi,  pourquoi: "allégation de santé" },
  { motif: /bien[- ]?[êe]tre/gi,                pourquoi: "allégation de santé" },
  { motif: /bienfait\w*/gi,                     pourquoi: "allégation de santé" },
  { motif: /soulag\w*|analg[ée]si\w*/gi,        pourquoi: "allégation thérapeutique" },
  { motif: /anti[- ]?inflammatoire\w*/gi,       pourquoi: "allégation thérapeutique" },
  { motif: /th[ée]rapeutique\w*|m[ée]dicinal\w*/gi, pourquoi: "allégation thérapeutique" },
  // `soigneusement` est écarté : « soigneusement sélectionnées » décrit la
  // préparation du produit, pas un effet sur celui qui le consomme.
  { motif: /gu[ée]ri(?:t|r|e|son|ss)\w*|\bsoigne(?!usement)\w*/gi, pourquoi: "allégation thérapeutique" },
  { motif: /anxi[ée]t[ée]|anxiolytique/gi,      pourquoi: "allégation thérapeutique" },
  { motif: /(?:am[ée]liore|favorise|aide).{0,20}sommeil/gi, pourquoi: "allégation de santé" },
  { motif: /douleur\w*/gi,                      pourquoi: "allégation thérapeutique" },
  { motif: /clart[ée] mentale/gi,               pourquoi: "effet psychologique" },
  { motif: /[ée]nergisant\w*|stimulant\w*/gi,   pourquoi: "effet physiologique" },
  // Sevrage tabagique : une cigarette électronique n'est pas un dispositif
  // d'aide à l'arrêt et ne peut être présentée comme tel.
  { motif: /(?:arr[êe]ter|arr[êe]t d[eu]).{0,15}(?:cigarette|tabac|fumer)/gi, pourquoi: "aide au sevrage" },
  { motif: /sevrage tabagique/gi,               pourquoi: "aide au sevrage" },
];

/** Superlatifs vides : ils affaiblissent une boutique qui se veut haut de gamme. */
const SUPERLATIFS = /r[ée]volutionn\w*|incontournable\w*|exceptionnel\w*|d'exception|le meilleur\b|inégalable\w*|ultime\b/gi;

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
const ENTITE = /&(?:[a-z]+|#\d+);/i;

const MIN_LONGUE = 400;
const MAX_LONGUE = 1100;
const MIN_COURTE = 60;
const MAX_COURTE = 160;

const produits = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ fichier: f, ...JSON.parse(readFileSync(join(DIR, f), "utf8")) }))
  .filter((p) => p.actif !== false);

const bloquants = [];
const signales = [];

for (const p of produits) {
  const longue = p.description || "";
  const courte = p.descriptionCourte || "";
  const texte = longue + "\n" + courte;

  // ── Bloquant : allégations ──
  for (const { motif, pourquoi } of ALLEGATIONS) {
    const trouves = texte.match(motif);
    if (trouves) {
      bloquants.push({
        id: p.id,
        quoi: `« ${[...new Set(trouves.map((t) => t.toLowerCase()))].join(" », « ")} »`,
        pourquoi,
      });
    }
  }

  // ── Signalé : qualité rédactionnelle ──
  const dire = (quoi) => signales.push({ id: p.id, quoi });

  if (!(p.pointsForts || []).length) dire("aucun point fort");
  if (EMOJI.test(texte)) dire("emoji dans la description");
  if (ENTITE.test(texte)) dire("entité HTML non décodée (ex. &eacute;)");
  if (courte && longue.includes(courte.trim())) dire("la description courte est un extrait de la longue");
  if (p.nom && longue.trim().toLowerCase().startsWith(p.nom.slice(0, 15).toLowerCase()))
    dire("la description commence par le nom du produit");
  if (longue.length > MAX_LONGUE) dire(`description de ${longue.length} signes (max ${MAX_LONGUE})`);
  if (longue.length && longue.length < MIN_LONGUE) dire(`description de ${longue.length} signes (min ${MIN_LONGUE})`);
  if (courte.length > MAX_COURTE) dire(`description courte de ${courte.length} signes (max ${MAX_COURTE})`);
  if (courte.length && courte.length < MIN_COURTE) dire(`description courte de ${courte.length} signes (min ${MIN_COURTE})`);
  const sup = texte.match(SUPERLATIFS);
  if (sup) dire(`superlatif creux : « ${[...new Set(sup.map((s) => s.toLowerCase()))].join(" », « ")} »`);
}

// ── Rapport ────────────────────────────────────────────────────────────────
if (bloquants.length) {
  console.error(`[rédaction] ✕ ${bloquants.length} allégation(s) interdite(s) sur un produit :\n`);
  const parProduit = new Map();
  for (const b of bloquants) {
    if (!parProduit.has(b.id)) parProduit.set(b.id, []);
    parProduit.get(b.id).push(b);
  }
  for (const [id, lignes] of parProduit) {
    console.error(`       ${id}`);
    for (const l of lignes) console.error(`         · ${l.quoi} — ${l.pourquoi}`);
  }
  console.error("\n       Un produit au CBD ne peut porter aucune allégation de santé ou");
  console.error("       thérapeutique (règl. CE 1924/2006, art. L121-2 code de la conso.).");
  console.error("       Décrire ce qu'on perçoit, jamais ce que le produit fait.");
  console.error("       Tournures de remplacement : docs/charte-fiches-produits.md\n");
}

if (signales.length) {
  const parType = new Map();
  for (const s of signales) {
    const cle = s.quoi.replace(/\d+/g, "N");
    if (!parType.has(cle)) parType.set(cle, []);
    parType.get(cle).push(s.id);
  }
  console.log(`[rédaction] ${signales.length} écart(s) à la charte, sur ${produits.length} fiches :`);
  for (const [quoi, ids] of [...parType].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`       · ${String(ids.length).padStart(3)} × ${quoi}`);
    if (ids.length <= 5) console.log(`             ${ids.join(", ")}`);
  }
  console.log();
}

if (bloquants.length) process.exit(1);
if (STRICT && signales.length) {
  console.error("[rédaction] ✕ mode strict : la charte n'est pas respectée partout.");
  process.exit(1);
}
if (!signales.length) console.log(`[rédaction] ✓ ${produits.length} fiches conformes à la charte`);
else console.log("[rédaction] ✓ aucune allégation interdite — les écarts ci-dessus sont à traiter");
