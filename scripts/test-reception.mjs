/**
 * scripts/test-reception.mjs
 * Tests de la réception de marchandise, sur un vrai SQLite en mémoire.
 *
 *   node scripts/test-reception.mjs
 *
 * On ne teste pas la lecture du document (elle dépend d'un modèle distant),
 * mais tout ce qui touche au stock — c'est-à-dire tout ce qui peut faire mal.
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { entrerStock, memoriserAlias, lireAlias, listerReceptions } from "../functions/_shared/stock.js";
import { apparier, convertirQuantite, normaliser } from "../functions/_shared/appariement.js";

const sq = new DatabaseSync(":memory:");
sq.exec(readFileSync("db/schema.sql", "utf8").replace(/unixepoch\(\) \* 1000/g, "0"));

/** Adaptateur minimal : expose l'API D1 par-dessus node:sqlite. */
const db = {
  prepare(sql) {
    const st = { args: [] };
    st.bind = (...a) => { st.args = a; return st; };
    st.run = async () => ({ meta: { changes: Number(sq.prepare(sql).run(...st.args).changes) } });
    st.all = async () => ({ results: sq.prepare(sql).all(...st.args) });
    st.first = async () => sq.prepare(sql).get(...st.args) ?? null;
    return st;
  },
  async batch(ops) { for (const o of ops) await o.run(); },
};

const poser = (cle, n) => sq
  .prepare("INSERT OR REPLACE INTO stocks (cle, dispo, reserve, libelle, majLe) VALUES (?, ?, 0, ?, 0)")
  .run(cle, n, cle);
const dispo = (cle) => sq.prepare("SELECT dispo FROM stocks WHERE cle = ?").get(cle)?.dispo ?? null;

let ko = 0;
const t = (libelle, condition, detail = "") => {
  if (!condition) ko++;
  console.log(`  ${condition ? "✅" : "❌"} ${libelle}${detail ? "  " + detail : ""}`);
};

const FLEUR = "amnesia-hydro-indoor-cbd";
const PIECE = "pod-recharge";

console.log("── Une réception ajoute au stock, elle ne le remplace pas ──");
poser(FLEUR, 120);
await entrerStock(db, [{ cle: FLEUR, quantite: 500 }], { reference: "BL-1" });
t("500 g s'ajoutent aux 120 g existants", dispo(FLEUR) === 620, `${dispo(FLEUR)} g`);
await entrerStock(db, [{ cle: FLEUR, quantite: 250 }], { reference: "BL-2" });
t("une seconde livraison s'ajoute encore", dispo(FLEUR) === 870, `${dispo(FLEUR)} g`);

console.log("\n── Le même bon ne s'applique qu'une fois ──");
poser(PIECE, 10);
const r1 = await entrerStock(db, [{ cle: PIECE, quantite: 24 }], { empreinte: "abc123", reference: "BL-3" });
t("premier dépôt appliqué", r1.ok && dispo(PIECE) === 34, `${dispo(PIECE)} pcs`);
const r2 = await entrerStock(db, [{ cle: PIECE, quantite: 24 }], { empreinte: "abc123", reference: "BL-3" });
t("second dépôt refusé", !r2.ok && r2.dejaTraite === true, r2.erreur);
t("le stock n'a pas bougé", dispo(PIECE) === 34, `${dispo(PIECE)} pcs`);

console.log("\n── Une référence jamais semée ne perd pas sa marchandise ──");
t("la ligne n'existe pas encore", dispo("produit-neuf") === null);
await entrerStock(db, [{ cle: "produit-neuf", quantite: 12, libelle: "Produit neuf" }], {});
t("elle est créée à la volée", dispo("produit-neuf") === 12);

console.log("\n── Tout est tracé ──");
const mvts = sq.prepare("SELECT motif, delta, cle FROM mouvements WHERE motif = 'reception'").all();
// 4 lignes réellement appliquées : BL-1, BL-2, BL-3, produit-neuf.
// Le second dépôt de BL-3 ayant été refusé, il ne laisse aucune trace de stock.
t("un mouvement par ligne réellement entrée", mvts.length === 4, `${mvts.length} mouvements`);
const recs = await listerReceptions(db, 10);
t("le bon dédoublonné est enregistré une fois", recs.length === 1, recs.map((r) => r.reference).join(", "));

console.log("\n── Les kilos deviennent des grammes ──");
t("0,5 kg → 500 g", convertirQuantite("0,5", "kg", "g").quantite === 500);
t("250 g restent 250", convertirQuantite("250", "g", "g").quantite === 250);
t("12 pièces restent 12", convertirQuantite(12, "pcs", "pcs").quantite === 12);
const suspect = convertirQuantite("1,2", "kg", "pcs");
t("un poids sur un produit à l'unité est signalé, pas deviné",
  suspect.quantite === null && Boolean(suspect.ambigu), suspect.ambigu);
const sansUnite = convertirQuantite("300", "", "g");
t("une unité absente est lue en grammes mais signalée",
  sansUnite.quantite === 300 && Boolean(sansUnite.ambigu), sansUnite.ambigu);

console.log("\n── Le système ne devine qu'une fois ──");
const libelleBon = "AMNES. HYDRO IND. 500G";
const avant = apparier(libelleBon, {});
t("première fois : proposé mais pas certain", avant.confiance !== "certain",
  `${avant.confiance} — ${avant.candidats[0]?.libelle}`);
t("le bon produit est tout de même en tête", avant.candidats[0]?.cle === FLEUR);

await memoriserAlias(db, [{ libelle: normaliser(libelleBon), cle: FLEUR, brut: libelleBon }],
                     { fournisseur: "Greenhouse" });
const apres = apparier(libelleBon, await lireAlias(db));
t("deuxième fois : reconnu d'office", apres.confiance === "certain" && apres.cle === FLEUR);

await memoriserAlias(db, [{ libelle: normaliser(libelleBon), cle: FLEUR, brut: libelleBon }]);
const vus = sq.prepare("SELECT vus FROM alias_fournisseur WHERE libelle = ?")
  .get(normaliser(libelleBon)).vus;
t("une confirmation renforce l'alias au lieu de le dupliquer", vus === 2, `vu ${vus} fois`);

await memoriserAlias(db, [{ libelle: normaliser(libelleBon), cle: PIECE, brut: libelleBon }]);
const corrige = sq.prepare("SELECT cle, vus FROM alias_fournisseur WHERE libelle = ?")
  .get(normaliser(libelleBon));
t("une correction remplace l'association et remet le compteur à 1",
  corrige.cle === PIECE && corrige.vus === 1);

console.log("\n── Un libellé inconnu ne s'invente pas de produit ──");
const inconnu = apparier("Boisson mystère 12 pack", {});
t("aucune clé retenue", inconnu.cle === null, `${inconnu.confiance} (${inconnu.score})`);

console.log("\n── Rien d'absurde n'entre en base ──");
const vide = await entrerStock(db, [], {});
t("une réception vide est refusée", !vide.ok, vide.erreur);
const zero = await entrerStock(db, [{ cle: PIECE, quantite: 0 }], {});
t("une quantité nulle est ignorée", !zero.ok, zero.erreur);

console.log(ko === 0 ? "\n🎉 La réception de marchandise se comporte comme prévu."
                     : `\n⚠️ ${ko} écart(s).`);
process.exit(ko ? 1 : 0);
