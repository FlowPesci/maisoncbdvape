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

// ── 5. La méthode 3.0 : liste FIXE, ordre imposé, étoile finale ─────────
//
// C'est ce que Monetico utilise réellement pour ce TPE. La méthode
// alphabétique prend tous les champs postés ; celle-ci n'en prend qu'une
// liste fixe et ignore le reste. Un champ de plus — `modepaiement` — suffit
// à séparer les deux, et c'est ce qui bloquait la recette.
{
  const recus = {
    TPE: "NI7668I", date: "19/09/2026_a_16:07:00", montant: "42.90EUR",
    reference: "ABC123", "texte-libre": "CMD-1", "code-retour": "payetest",
    cvx: "oui", vld: "1230", brand: "VI", status3ds: "1", numauto: "010101",
    originecb: "FRA", bincb: "010101", hpancb: "74E94B03", ipclient: "127.0.0.1",
    originetr: "FRA", veres: "Y", pares: "Y",
    // Champs postés en plus, absents de la chaîne 3.0 : ils doivent être ignorés.
    modepaiement: "CB", PqFR: "peu importe",
  };
  // La banque scelle la liste fixe, dans l'ordre, avec l'étoile finale.
  const chaine30 = [
    recus.TPE, recus.date, recus.montant, recus.reference, recus["texte-libre"],
    "3.0", recus["code-retour"], recus.cvx, recus.vld, recus.brand,
    recus.status3ds, recus.numauto, "", recus.originecb, recus.bincb,
    recus.hpancb, recus.ipclient, recus.originetr, recus.veres, recus.pares,
  ].join("*") + "*";
  const mac = await sceauDeReference(chaine30);
  const corps = Object.entries({ ...recus, MAC: mac })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");

  const r = await verifierNotification(env, corps);
  console.log("\nMéthode 3.0 — liste fixe, champs surnuméraires ignorés");
  verifier("sceau reconnu", r.valide,
    "c'est la panne du 2026-09-19 : nous concaténions TOUS les champs postés");
  verifier("la méthode 3.0 est bien celle retenue",
    String(r.variante || "").endsWith("/v3.0"), "variante = " + r.variante);
  verifier("le code-retour reste exploitable",
    r.params["code-retour"] === "payetest", r.params["code-retour"]);
}

// ── 6. L'exemple officiel de la documentation ───────────────────────────
// Vérifie la FORME de la chaîne — ordre, séparateurs, étoile finale, place
// vide du motif de refus — contre l'exemple publié par Euro Information
// (doc technique v3.0a, § 1.3.3.2). Le sceau de l'exemple n'est pas
// reproductible sans la clé d'origine ; c'est la chaîne qu'on contrôle.
{
  const attendu = "1234567*05/12/2006_a_11:55:23*62.75EUR*ABERTYP00145*LeTexteLibre"
    + "*3.0*paiement*oui*1208*VI*1*010101**FRA*010101"
    + "*74E94B03C22D786E0F2C2CADBFC1C00B004B7C45*127.0.0.1*FRA*Y*Y*";

  const { chaineRetour30Pour } = await import("../functions/_shared/monetico.js");
  const obtenu = chaineRetour30Pour({
    TPE: "1234567", date: "05/12/2006_a_11:55:23", montant: "62.75EUR",
    reference: "ABERTYP00145", "texte-libre": "LeTexteLibre",
    "code-retour": "paiement", cvx: "oui", vld: "1208", brand: "VI",
    status3ds: "1", numauto: "010101", originecb: "FRA", bincb: "010101",
    hpancb: "74E94B03C22D786E0F2C2CADBFC1C00B004B7C45",
    ipclient: "127.0.0.1", originetr: "FRA", veres: "Y", pares: "Y",
  });
  console.log("\nChaîne conforme à l'exemple de la documentation");
  verifier("identique à l'exemple publié", obtenu === attendu,
    "\n       attendu : " + attendu + "\n       obtenu  : " + obtenu);
}

console.log("");
if (echecs.length) {
  console.error(`[sceau] ✕ ${echecs.length} contrôle(s) en échec\n`);
  process.exit(1);
}
console.log("[sceau] ✓ les deux méthodes de scellement et les trois lectures du corps\n");
