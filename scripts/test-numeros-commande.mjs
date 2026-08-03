/**
 * scripts/test-numeros-commande.mjs
 * Bascule du préfixe des numéros de commande : « TG- » → « MCV- ».
 *
 *   npm run test:commandes
 *
 * Ce que ces tests protègent :
 *  · les anciens numéros restent reconnus — un client peut présenter un
 *    numéro émis avant la bascule, et il doit fonctionner ;
 *  · les anciennes commandes restent listées dans le back-office — le
 *    préfixe est leur clé de rangement dans KV ;
 *  · la référence bancaire ne change pas — elle est dérivée des douze
 *    derniers caractères, où le préfixe n'entre pas.
 */

import { generateOrderId, MOTIF_COMMANDE, PREFIXE_COMMANDE, PREFIXES_RECONNUS, listOrders }
  from "../functions/_shared/orders.js";
import { moneticoReference } from "../functions/_shared/monetico.js";

let ko = 0;
const t = (l, c, d = "") => { if (!c) ko++; console.log(`  ${c ? "✅" : "❌"} ${l}${d ? "  " + d : ""}`); };

console.log("── Les nouveaux numéros portent le bon préfixe ──");
const nouveaux = Array.from({ length: 200 }, generateOrderId);
t("200 numéros générés, tous en MCV-", nouveaux.every((n) => n.startsWith("MCV-")));
t("aucun ne porte encore TG-", !nouveaux.some((n) => n.startsWith("TG-")));
t("tous respectent le format attendu", nouveaux.every((n) => MOTIF_COMMANDE.test(n)));
t("ils sont uniques", new Set(nouveaux).size === nouveaux.length, `${new Set(nouveaux).size} distincts`);

console.log("\n── Les anciens numéros restent acceptés ──");
t("un TG- passe la validation", MOTIF_COMMANDE.test("TG-202604281430-A1B2"));
t("un MCV- passe la validation", MOTIF_COMMANDE.test("MCV-202604281430-A1B2"));
t("un préfixe inventé est refusé", !MOTIF_COMMANDE.test("XX-202604281430-A1B2"));
t("un format tronqué est refusé", !MOTIF_COMMANDE.test("MCV-2026-A1B2"));
t("une minuscule est refusée", !MOTIF_COMMANDE.test("MCV-202604281430-a1b2"));

console.log("\n── La référence bancaire ne bouge pas ──");
for (const suffixe of ["202607251115-K7QM", "202601010000-AAAA", "202612312359-Z9X8"]) {
  const a = moneticoReference("TG-" + suffixe), b = moneticoReference("MCV-" + suffixe);
  t(`${suffixe} → ${a}`, a === b && a.length === 12);
}

console.log("\n── Le back-office voit les commandes des deux époques ──");
// Faux KV : deux commandes, une de chaque époque.
const stock = new Map([
  ["TG-202601011000-AAAA",  JSON.stringify({ orderId: "TG-202601011000-AAAA",  status: "paid", createdAt: "2026-01-01T10:00:00Z", items: [] })],
  ["MCV-202608011000-BBBB", JSON.stringify({ orderId: "MCV-202608011000-BBBB", status: "paid", createdAt: "2026-08-01T10:00:00Z", items: [] })],
]);
const kv = {
  async list({ prefix }) {
    return { keys: [...stock.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
             list_complete: true };
  },
  async get(k) { return stock.get(k) ?? null; },
};
const listees = await listOrders(kv);
t("les deux commandes remontent", listees.length === 2, `${listees.length} trouvée(s)`);
t("l'ancienne TG- est bien présente", listees.some((o) => o.orderId.startsWith("TG-")));
t("triées de la plus récente à la plus ancienne", listees[0].orderId.startsWith("MCV-"));

console.log("\n── Les deux préfixes sont déclarés une seule fois ──");
t("PREFIXE_COMMANDE vaut MCV-", PREFIXE_COMMANDE === "MCV-");
t("PREFIXES_RECONNUS contient les deux", PREFIXES_RECONNUS.join(",") === "MCV-,TG-");

console.log(ko ? `\n❌ ${ko} test(s) en échec` : "\n✅ La bascule ne casse rien");
process.exit(ko ? 1 : 0);
