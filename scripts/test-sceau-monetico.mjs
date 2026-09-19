/**
 * scripts/test-sceau-monetico.mjs
 *
 * Vérifie que la validation du sceau retour survit au décodage du corps.
 *
 * ─── Pourquoi ─────────────────────────────────────────────────────────────
 * Le 2026-09-19, Monetico nous appelait bel et bien — le journal de
 * `/admin/diagnostic/` le montrait — et CHAQUE notification était rejetée,
 * avec une clé MAC pourtant présente et de bonne longueur. Le sceau aller
 * fonctionnait, donc la clé et sa dérivation étaient bonnes.
 *
 * La cause était le décodage : Monetico signe la chaîne avant transport, nous
 * la reconstruisons après. Le champ `authentification` est du base64, il
 * contient des « + », et dans un corps `x-www-form-urlencoded` un « + » se
 * décode en ESPACE. `request.formData()` respecte la norme et détruit le
 * sceau.
 *
 * Ce test rejoue la scène avec une clé de test : il fabrique un corps comme
 * Monetico l'envoie, et exige que le sceau soit reconnu.
 *
 *   node scripts/test-sceau-monetico.mjs
 * ─────────────────────────────────────────────────────────────────────────── */

import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { verifierNotification } = await import("../functions/_shared/monetico.js");

// Clé de test — 40 caractères hexadécimaux, sans aucun rapport avec la vraie.
const env = { MONETICO_CLE_MAC: "0123456789ABCDEF0123456789ABCDEF01234567" };

/** Reproduit la dérivation et le HMAC côté « banque » pour fabriquer un sceau. */
async function sceauDeReference(chaine) {
  const key = env.MONETICO_CLE_MAC;
  let hexStrKey = key.substring(0, 38);
  const hexFinal = key.substring(38, 40) + "00";
  const cca0 = hexFinal.charCodeAt(0);
  if (cca0 > 70 && cca0 < 97) hexStrKey += String.fromCharCode(cca0 - 23) + hexFinal.substring(1, 2);
  else if (hexFinal.substring(1, 2) === "M") hexStrKey += hexFinal.substring(0, 1) + "0";
  else hexStrKey += hexFinal.substring(0, 2);

  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) bytes[i] = parseInt(hexStrKey.substr(i * 2, 2), 16);

  const k = await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(chaine));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const echecs = [];
function verifier(nom, condition, detail) {
  if (condition) console.log(`  ✓ ${nom}`);
  else { console.log(`  ✕ ${nom} — ${detail}`); echecs.push(nom); }
}

/**
 * Fabrique un corps POSTé.
 * @param {object} champs
 * @param {(v: string) => string} encoder - comment la plateforme échappe les valeurs
 */
async function corpsSigne(champs, encoder) {
  const chaine = Object.keys(champs).sort().map((k) => `${k}=${champs[k]}`).join("*");
  const mac = await sceauDeReference(chaine);
  const corps = Object.entries({ ...champs, MAC: mac })
    .map(([k, v]) => `${k}=${encoder(v)}`)
    .join("&");
  return { corps, mac, chaine };
}

console.log("\n[sceau] Validation du sceau retour Monetico\n");

// ── 1. Cas ordinaire : rien d'exotique dans les valeurs ──────────────────
{
  const champs = {
    TPE: "NI7668I", date: "19/09/2026_a_15:50:00", montant: "42.90EUR",
    reference: "ABC123", "code-retour": "payetest", "texte-libre": "CMD-1",
  };
  const { corps } = await corpsSigne(champs, encodeURIComponent);
  const r = await verifierNotification(env, corps);
  console.log("Notification ordinaire");
  verifier("sceau reconnu", r.valide, "refusé alors qu'il est correct");
  verifier("le code-retour est lisible", r.params["code-retour"] === "payetest", r.params["code-retour"]);
}

// ── 2. Le cas qui cassait tout : base64 avec « + » non échappé ───────────
{
  const champs = {
    TPE: "NI7668I", date: "19/09/2026_a_15:50:00", montant: "42.90EUR",
    reference: "ABC123", "code-retour": "payetest",
    // Base64 réaliste : contient « + » et « / ».
    authentification: "eyJzdGF0dXMiOiJhdXRo+ZW50aWNhdGVkIiwiL3Byb3RvY29sIjoiM0RTZWN1cmUifQ==",
  };
  // La plateforme n'échappe PAS le « + » : il voyage tel quel dans le corps.
  const { corps } = await corpsSigne(champs, (v) => v.replace(/ /g, "%20"));
  const r = await verifierNotification(env, corps);
  console.log("\nBase64 avec « + » non échappé");
  verifier("sceau reconnu", r.valide,
    "c'est exactement la panne du 2026-09-19 : le décodage standard transforme « + » en espace");
  verifier("la lecture retenue n'est pas la standard",
    r.variante && r.variante !== "standard",
    "variante = " + r.variante);
  verifier("la valeur base64 garde ses « + »",
    String(r.params.authentification || "").includes("+"),
    r.params.authentification);
}

// ── 3. Un sceau faux reste refusé ────────────────────────────────────────
// Essayer plusieurs lectures ne doit jamais devenir une porte ouverte.
{
  const champs = { TPE: "NI7668I", reference: "ABC123", "code-retour": "payetest" };
  const { corps } = await corpsSigne(champs, encodeURIComponent);
  const falsifie = corps.replace(/MAC=[0-9a-f]{40}/, "MAC=" + "f".repeat(40));
  const r = await verifierNotification(env, falsifie);
  console.log("\nSceau falsifié");
  verifier("refusé", !r.valide, "un sceau faux a été accepté — faille");
  verifier("aucune variante n'est revendiquée", r.variante === null, r.variante);
}

// ── 4. Montant ou libellé contenant une vraie espace ─────────────────────
// L'espace légitime voyage en %20 ou en « + » : les deux doivent passer.
{
  const champs = { TPE: "NI7668I", reference: "ABC123", "texte-libre": "Commande 42" };
  const { corps } = await corpsSigne(champs, (v) => v.replace(/ /g, "%20"));
  const r = await verifierNotification(env, corps);
  console.log("\nEspace légitime, échappée en %20");
  verifier("sceau reconnu", r.valide, "refusé");
  verifier("l'espace est restituée", r.params["texte-libre"] === "Commande 42", r.params["texte-libre"]);
}

console.log("");
if (echecs.length) {
  console.error(`[sceau] ✕ ${echecs.length} contrôle(s) en échec\n`);
  process.exit(1);
}
console.log("[sceau] ✓ le sceau retour survit aux trois lectures du corps\n");
