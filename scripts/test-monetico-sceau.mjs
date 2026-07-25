/**
 * scripts/test-monetico-sceau.mjs
 * Vérifie la construction de la chaîne à sceller « Aller » contre l'exemple
 * officiel du kit Monetico V4.0 (p.monetico-services.com).
 *
 * Usage : node scripts/test-monetico-sceau.mjs
 */
import { moneticoDate, moneticoMontant, moneticoReference } from "../functions/_shared/monetico.js";

// Reproduction de chaineAller() (fonction privée du module)
const chaineAller = (f) => [
  f.TPE, f.date, f.montant, f.reference, f["texte-libre"] || "", f.version,
  f.lgue, f.societe, f.mail || "", f.nbrech || "",
  f.dateech1 || "", f.montantech1 || "", f.dateech2 || "", f.montantech2 || "",
  f.dateech3 || "", f.montantech3 || "", f.dateech4 || "", f.montantech4 || "",
  f.options || "",
].join("*");

let ko = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) ko++;
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  if (!ok) console.log(`   attendu : ${want}\n   obtenu  : ${got}`);
};

// ── 1. Chaîne à sceller (exemple officiel Euro Information) ──────────────────
check("chaîne à sceller « Aller »",
  chaineAller({
    TPE: "2808088",
    date: "25/07/2026:11:15:08",
    montant: "1.01EUR",
    reference: "ref111508",
    "texte-libre": "Texte Libre",
    version: "3.0",
    lgue: "FR",
    societe: "ZNC60BETSELE",
    mail: "test@test.zz",
  }),
  "2808088*25/07/2026:11:15:08*1.01EUR*ref111508*Texte Libre*3.0*FR*ZNC60BETSELE*test@test.zz**********"
);

// ── 2. Formatage du montant ─────────────────────────────────────────────────
check("montant 49.9 → 49.90EUR",       moneticoMontant(49.9),        "49.90EUR");
check("montant 100 → 100.00EUR",       moneticoMontant(100),         "100.00EUR");
check("montant 0.1+0.2 → 0.30EUR",     moneticoMontant(0.1 + 0.2),   "0.30EUR");
check("montant 29.9+3.9 → 33.80EUR",   moneticoMontant(29.9 + 3.9),  "33.80EUR");

// ── 3. Référence dérivée de l'orderId ───────────────────────────────────────
check("référence ≤ 12 alphanumériques",
  moneticoReference("TG-202607251115-K7QM"), "07251115K7QM");
check("référence alphanumérique stricte",
  /^[A-Z0-9]{1,12}$/.test(moneticoReference("TG-202607251115-K7QM")) ? "ok" : "ko", "ok");

// ── 4. Format de date ───────────────────────────────────────────────────────
check("format de date JJ/MM/AAAA:HH:MM:SS",
  /^\d{2}\/\d{2}\/\d{4}:\d{2}:\d{2}:\d{2}$/.test(moneticoDate()) ? "ok" : "ko", "ok");

console.log(ko === 0 ? "\n🎉 Tous les tests passent." : `\n⚠️  ${ko} test(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
