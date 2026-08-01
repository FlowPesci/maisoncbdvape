/**
 * scripts/test-inventaire.mjs
 * Tests de la saisie groupée des stocks, sur un vrai SQLite en mémoire.
 *
 *   npm run test:inventaire
 *
 * Ce que ces tests protègent, dans l'ordre d'importance :
 *  · le lot est refusé en entier si une clé est inconnue — un inventaire à
 *    moitié appliqué serait impossible à rattraper ;
 *  · `reserve` n'est jamais écrasé — l'écraser relâcherait des paniers en
 *    cours de paiement ;
 *  · les lignes inchangées ne tracent pas de mouvement de zéro.
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { ajusterStocks } from "../functions/_shared/stock.js";

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
const poser = (c,n,r=0)=>sq.prepare("INSERT OR REPLACE INTO stocks (cle,dispo,reserve,libelle,majLe) VALUES (?,?,?,?,0)").run(c,n,r,c);
const dispo = (c)=>sq.prepare("SELECT dispo FROM stocks WHERE cle=?").get(c)?.dispo ?? null;
const reserve = (c)=>sq.prepare("SELECT reserve FROM stocks WHERE cle=?").get(c)?.reserve ?? null;
const mvts = ()=>sq.prepare("SELECT COUNT(*) n FROM mouvements").get().n;
let ko=0; const t=(l,c,d="")=>{ if(!c) ko++; console.log(`  ${c?"✅":"❌"} ${l}${d?"  "+d:""}`); };

console.log("── Un inventaire s'applique d'un bloc ──");
poser("a",10); poser("b",10); poser("c",10);
let r = await ajusterStocks(db,[{cle:"a",dispo:340},{cle:"b",dispo:0},{cle:"c",dispo:7}],{auteur:"pesci"});
t("les 3 quantités sont écrites", r.ok && dispo("a")===340 && dispo("b")===0 && dispo("c")===7, JSON.stringify(r));
t("3 mouvements tracés", mvts()===3, String(mvts()));

console.log("\n── Les lignes inchangées ne sont pas écrites ──");
const avant = mvts();
r = await ajusterStocks(db,[{cle:"a",dispo:340},{cle:"c",dispo:99}]);
t("seule la ligne modifiée compte", r.appliquees===1 && r.inchangees===1, JSON.stringify(r));
t("un seul mouvement de plus", mvts()===avant+1, String(mvts()-avant));

console.log("\n── Une clé inconnue annule tout le lot ──");
const d_a = dispo("a"), m = mvts();
r = await ajusterStocks(db,[{cle:"a",dispo:1},{cle:"fantome",dispo:5}]);
t("le lot est refusé", !r.ok && r.inconnues?.[0]==="fantome", r.erreur);
t("rien n'a été écrit", dispo("a")===d_a && mvts()===m, `a=${dispo("a")}`);

console.log("\n── Le réservé n'est jamais touché ──");
poser("d",50,12);
await ajusterStocks(db,[{cle:"d",dispo:200}]);
t("dispo changé, reserve intacte", dispo("d")===200 && reserve("d")===12, `reserve=${reserve("d")}`);

console.log("\n── Quantités refusées ──");
for (const [lib,val] of [["négative",-1],["décimale",3.5],["texte","huit"],["irréaliste",2000000]]) {
  const rr = await ajusterStocks(db,[{cle:"a",dispo:val}]);
  t(`quantité ${lib} refusée`, !rr.ok, rr.erreur);
}
t("clé vide refusée", !(await ajusterStocks(db,[{cle:"  ",dispo:1}])).ok);
t("lot vide refusé", !(await ajusterStocks(db,[])).ok);

console.log("\n── Doublon : la dernière valeur gagne ──");
await ajusterStocks(db,[{cle:"a",dispo:11},{cle:"a",dispo:22}]);
t("a vaut 22", dispo("a")===22, String(dispo("a")));

console.log("\n── 121 références, comme à la mise en service ──");
// Toutes les références partent à 10, la valeur de semis. `p9` reçoit
// justement 10 : il est donc laissé de côté, et c'est le comportement voulu
// — 120 lignes écrites, 1 inchangée. Le compte doit le refléter.
const lot=[]; for(let i=0;i<121;i++){ poser("p"+i,10); lot.push({cle:"p"+i,dispo:i+1}); }
const m2=mvts();
r = await ajusterStocks(db,lot,{auteur:"pesci"});
t("120 lignes écrites, 1 déjà bonne", r.ok && r.appliquees===120 && r.inchangees===1, JSON.stringify({appliquees:r.appliquees,inchangees:r.inchangees}));
t("chaque valeur est la bonne", dispo("p0")===1 && dispo("p9")===10 && dispo("p120")===121, `p120=${dispo("p120")}`);
t("120 mouvements tracés, aucun de zéro", mvts()===m2+120, String(mvts()-m2));

console.log(ko ? `\n❌ ${ko} test(s) en échec` : "\n✅ Tous les tests passent");
process.exit(ko?1:0);
