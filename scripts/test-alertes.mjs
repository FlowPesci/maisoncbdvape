/**
 * scripts/test-alertes.mjs
 * Alerte de réassort et attentes de retour en stock, sur SQLite en mémoire.
 *
 *   npm run test:alertes
 *
 * Ce que ces tests protègent :
 *  · le seuil dépend de l'unité — 3 pour une pièce, 30 pour un gramme ;
 *  · une référence basse n'alerte QU'UNE FOIS, sinon le commerçant apprend
 *    à ignorer ces messages ;
 *  · elle réalerte après être remontée puis redescendue.
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { alertesAEmettre, ajusterStock, ajusterStocks, entrerStock, reserverPanier }
  from "../functions/_shared/stock.js";
import { seuilAlerte, stockFaible } from "../functions/_shared/catalog-index.js";

const sq = new DatabaseSync(":memory:");
sq.exec(readFileSync("db/schema.sql", "utf8").replace(/unixepoch\(\) \* 1000/g, "0"));

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

const poser = (c, n) => sq
  .prepare("INSERT OR REPLACE INTO stocks (cle, dispo, reserve, libelle, majLe, alerteLe) VALUES (?,?,0,?,0,NULL)")
  .run(c, n, c);
const dispo = (c) => sq.prepare("SELECT dispo FROM stocks WHERE cle=?").get(c)?.dispo ?? null;

let ko = 0;
const t = (l, c, d = "") => { if (!c) ko++; console.log(`  ${c ? "✅" : "❌"} ${l}${d ? "  " + d : ""}`); };

const FLEUR = "amnesia-hydro-indoor-cbd";   // au gramme
const PIECE = "pod-recharge";               // à l'unité

console.log("── Le seuil dépend de l'unité ──");
t("une pièce alerte à 3", seuilAlerte(PIECE) === 3, String(seuilAlerte(PIECE)));
t("une fleur alerte à 30 g", seuilAlerte(FLEUR) === 30, String(seuilAlerte(FLEUR)) + " g");
t("20 g de fleur est un stock faible", stockFaible(FLEUR, 20));
t("20 pièces ne l'est pas", !stockFaible(PIECE, 20));
t("une rupture n'est pas un stock faible", !stockFaible(PIECE, 0));

console.log("\n── Une référence basse n'alerte qu'une fois ──");
poser(FLEUR, 25);
let a = await alertesAEmettre(db, [FLEUR]);
t("premier passage : elle est signalée", a.length === 1 && a[0].seuil === 30, JSON.stringify(a[0] || {}));
a = await alertesAEmettre(db, [FLEUR]);
t("second passage : silence", a.length === 0);

console.log("\n── Remontée puis redescente : elle réalerte ──");
await ajusterStock(db, FLEUR, 500, { auteur: "pesci" });
t("le réassort a bien eu lieu", dispo(FLEUR) === 500, `${dispo(FLEUR)} g`);
poser(FLEUR, 500); // on repart d'un stock sain sans toucher alerteLe
await ajusterStock(db, FLEUR, 500);
sq.prepare("UPDATE stocks SET dispo = 12 WHERE cle = ?").run(FLEUR);
a = await alertesAEmettre(db, [FLEUR]);
t("après un vrai réassort, l'alerte repart", a.length === 1, JSON.stringify(a.map((x) => x.cle)));

console.log("\n── Une rupture franche est signalée ──");
poser(PIECE, 0);
a = await alertesAEmettre(db, [PIECE]);
t("stock à zéro : signalé", a.length === 1 && a[0].dispo === 0);

console.log("\n── Un stock confortable ne dit rien ──");
poser("confortable", 400);
sq.prepare("UPDATE stocks SET libelle='Confortable' WHERE cle='confortable'").run();
a = await alertesAEmettre(db, ["confortable"]);
t("aucune alerte", a.length === 0);

console.log("\n── L'inventaire groupé réarme les alertes ──");
poser(PIECE, 1);
await alertesAEmettre(db, [PIECE]);
await ajusterStocks(db, [{ cle: PIECE, dispo: 60 }], { auteur: "pesci" });
sq.prepare("UPDATE stocks SET dispo = 2 WHERE cle = ?").run(PIECE);
a = await alertesAEmettre(db, [PIECE]);
t("réalerte après saisie d'inventaire", a.length === 1, `${dispo(PIECE)} pcs`);

console.log("\n── Une réception réarme aussi ──");
poser(FLEUR, 5);
await alertesAEmettre(db, [FLEUR]);
const r = await entrerStock(db, [{ cle: FLEUR, quantite: 800 }], { reference: "BL-9" });
t("les clés reçues sont rendues à l'appelant", r.ok && r.cles?.includes(FLEUR), JSON.stringify(r.cles));
sq.prepare("UPDATE stocks SET dispo = 10 WHERE cle = ?").run(FLEUR);
a = await alertesAEmettre(db, [FLEUR]);
t("réalerte après réception", a.length === 1);

console.log("\n── Une commande remonte les clés qu'elle a touchées ──");
poser(PIECE, 40);
const resa = await reserverPanier(db, "CMD-1", [{ id: PIECE, nom: "Pod", qty: 2 }]);
t("réservation acceptée", resa.ok);
t("les clés sont fournies pour l'alerte", Array.isArray(resa.cles) && resa.cles.length === 1,
  JSON.stringify(resa.cles));

console.log("\n── Attentes de retour en stock ──");
const attendre = (cle, mail) => sq
  .prepare("INSERT OR IGNORE INTO attentes (cle, email, creeLe, prevenuLe) VALUES (?,?,?,NULL)")
  .run(cle, mail, Date.now());
attendre(FLEUR, "a@x.fr"); attendre(FLEUR, "b@x.fr"); attendre(FLEUR, "a@x.fr");
const n = sq.prepare("SELECT COUNT(*) n FROM attentes WHERE cle=?").get(FLEUR).n;
t("une même adresse ne s'inscrit qu'une fois", n === 2, `${n} inscrits`);

console.log(ko ? `\n❌ ${ko} test(s) en échec` : "\n✅ Les alertes se comportent comme prévu");
process.exit(ko ? 1 : 0);
