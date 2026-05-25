/**
 * sync-r2.mjs — Sync images vers Cloudflare R2 (API S3-compatible, sans dépendance)
 *
 * Prérequis — créer des R2 API credentials dans le dashboard Cloudflare :
 *   dash.cloudflare.com → R2 → Manage R2 API Tokens → Create API Token
 *   Permissions : Object Read & Write sur le bucket tabacgex-media
 *
 * Configurer les variables d'environnement (PowerShell) :
 *   $env:R2_ACCESS_KEY_ID     = "xxxx"
 *   $env:R2_SECRET_ACCESS_KEY = "xxxx"
 *   $env:R2_ACCOUNT_ID        = "xxxx"   ← visible dans l'URL du dashboard
 *
 * Usage :
 *   node scripts/sync-r2.mjs --list
 *   node scripts/sync-r2.mjs --check
 *   node scripts/sync-r2.mjs --upload --source "C:\chemin\images"
 */

import { readdirSync, readFileSync, existsSync, createReadStream, statSync } from "node:fs";
import { resolve, join, extname, basename } from "node:path";
import { createHmac, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { request } from "node:https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "..");
const PRODUITS  = resolve(ROOT, "src/data-source/produits");
const BUCKET    = "tabacgex-media";

// ── Config R2 depuis variables d'environnement ────────────────────────────
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;

function checkConfig() {
  if (!ACCESS_KEY || !SECRET_KEY || !ACCOUNT_ID) {
    console.error(`
❌  Variables d'environnement manquantes. Dans PowerShell :

   $env:R2_ACCESS_KEY_ID     = "votre_access_key"
   $env:R2_SECRET_ACCESS_KEY = "votre_secret_key"
   $env:R2_ACCOUNT_ID        = "votre_account_id"

Les credentials R2 se créent sur :
  dash.cloudflare.com → R2 → Manage R2 API Tokens → Create API Token
`);
    process.exit(1);
  }
}

const ENDPOINT_HOST = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;

// ══════════════════════════════════════════════════════════════════════════
// AWS Signature V4 (implémentation native Node.js)
// ══════════════════════════════════════════════════════════════════════════

function sha256hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key, data) {
  return createHmac("sha256", key).update(data).digest();
}

function getSigningKey(secretKey, date, region, service) {
  const kDate    = hmacSha256(`AWS4${secretKey}`, date);
  const kRegion  = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function signRequest({ method, path, query = "", body = "", contentType = "" }) {
  const now    = new Date();
  const date   = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const day    = date.slice(0, 8);
  const region = "auto";
  const service= "s3";

  const bodyHash = sha256hex(body);
  const headers  = {
    host          : ENDPOINT_HOST,
    "x-amz-date"  : date,
    "x-amz-content-sha256": bodyHash,
    ...(contentType ? { "content-type": contentType } : {}),
  };

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort()
    .map(k => `${k}:${headers[k]}\n`).join("");

  const canonicalRequest = [
    method, path, query,
    canonicalHeaders, signedHeaders, bodyHash,
  ].join("\n");

  const credentialScope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256", date, credentialScope, sha256hex(canonicalRequest),
  ].join("\n");

  const sigKey = getSigningKey(SECRET_KEY, day, region, service);
  const sig    = createHmac("sha256", sigKey).update(stringToSign).digest("hex");

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
  };
}

// ── Requête HTTPS générique ───────────────────────────────────────────────
function httpsRequest({ method, path, query = "", headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const fullPath = query ? `${path}?${query}` : path;
    const req = request(
      { hostname: ENDPOINT_HOST, path: fullPath, method, headers },
      res => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Requête pour upload (streaming) ──────────────────────────────────────
function uploadFile(localPath, r2Key) {
  return new Promise((resolve, reject) => {
    const ext = extname(localPath).toLowerCase();
    const ct  = { ".jpg":"image/jpeg", ".jpeg":"image/jpeg",
                  ".png":"image/png",  ".webp":"image/webp",
                  ".gif":"image/gif" }[ext] || "application/octet-stream";

    // Lire le fichier pour calculer le hash du body
    const fileBuffer = readFileSync(localPath);
    const bodyHash   = sha256hex(fileBuffer);
    const size       = fileBuffer.length;
    const path       = `/${BUCKET}/${r2Key}`;
    const now        = new Date();
    const date       = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const day        = date.slice(0, 8);
    const region     = "auto";
    const service    = "s3";

    const headers = {
      host                      : ENDPOINT_HOST,
      "x-amz-date"              : date,
      "x-amz-content-sha256"    : bodyHash,
      "content-type"            : ct,
      "content-length"          : String(size),
    };

    const signedHeaders = Object.keys(headers).sort().join(";");
    const canonicalHeaders = Object.keys(headers).sort()
      .map(k => `${k}:${headers[k]}\n`).join("");

    const canonicalRequest = ["PUT", path, "", canonicalHeaders, signedHeaders, bodyHash].join("\n");
    const credentialScope   = `${day}/${region}/${service}/aws4_request`;
    const stringToSign      = ["AWS4-HMAC-SHA256", date, credentialScope, sha256hex(canonicalRequest)].join("\n");
    const sigKey            = getSigningKey(SECRET_KEY, day, region, service);
    const sig               = createHmac("sha256", sigKey).update(stringToSign).digest("hex");

    const finalHeaders = {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
    };

    const req = request(
      { hostname: ENDPOINT_HOST, path, method: "PUT", headers: finalHeaders },
      res => {
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => resolve(res.statusCode >= 200 && res.statusCode < 300));
      }
    );
    req.on("error", reject);
    req.write(fileBuffer);
    req.end();
  });
}

// ── Lister objets R2 avec pagination ─────────────────────────────────────
async function listR2(prefix = "media/produits/") {
  const keys = new Set();
  let continuationToken = null;
  let page = 1;

  process.stdout.write(`📦  Listage du bucket "${BUCKET}" (prefix: ${prefix}) `);

  do {
    const query = `list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`
      + (continuationToken ? `&continuation-token=${encodeURIComponent(continuationToken)}` : "");

    const hdrs = signRequest({ method: "GET", path: `/${BUCKET}`, query, body: "" });
    const res  = await httpsRequest({ method: "GET", path: `/${BUCKET}`, query, headers: hdrs });

    if (res.status !== 200) {
      console.error(`\n❌  Erreur R2 (HTTP ${res.status}) :\n${res.body}`);
      process.exit(1);
    }

    // Parser la réponse XML
    const matches = res.body.matchAll(/<Key>([^<]+)<\/Key>/g);
    for (const m of matches) keys.add(m[1]);

    const truncMatch = res.body.match(/<IsTruncated>([^<]+)<\/IsTruncated>/);
    const truncated  = truncMatch?.[1]?.toLowerCase() === "true";
    const tokenMatch = res.body.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
    continuationToken = truncated ? tokenMatch?.[1] : null;

    process.stdout.write(".");
    page++;
  } while (continuationToken);

  console.log(` ✅  ${keys.size} objets`);
  return keys;
}

// ── Collecter images attendues depuis les JSONs ───────────────────────────
function collectExpected() {
  const map = new Map();
  for (const f of readdirSync(PRODUITS).filter(f => f.endsWith(".json"))) {
    const d = JSON.parse(readFileSync(join(PRODUITS, f), "utf8"));
    const add = path => {
      if (!path?.startsWith("/media/")) return;
      const key = path.replace(/^\//, "");
      if (!map.has(key)) {
        const localHint = basename(key).replace(/^\d+-/, "");
        map.set(key, { produitId: d.id || f.replace(".json",""), localHint });
      }
    };
    add(d.image);
    (d.galerie || []).forEach(add);
  }
  return map;
}

// ── Trouver fichier local par correspondance de nom ───────────────────────
function findLocal(hint, dir) {
  if (!dir || !existsSync(dir)) return null;
  const norm = s => s.toLowerCase()
    .normalize("NFD").replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const hintN = norm(hint.replace(/\.[^.]+$/, ""));
  for (const f of readdirSync(dir)) {
    if (norm(f.replace(/\.[^.]+$/, "")) === hintN) return join(dir, f);
  }
  for (const f of readdirSync(dir)) {
    const fn = norm(f.replace(/\.[^.]+$/, ""));
    if (fn.includes(hintN) || hintN.includes(fn)) return join(dir, f);
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════

const args        = process.argv.slice(2);
const MODE_CHECK  = args.includes("--check");
const MODE_UPLOAD = args.includes("--upload");
const MODE_LIST   = args.includes("--list");
const SOURCE_DIR  = (() => { const i = args.indexOf("--source"); return i !== -1 ? args[i+1] : null; })();

if (MODE_LIST) {
  checkConfig();
  const keys = await listR2("media/produits/");
  console.log();
  [...keys].sort().forEach(k => console.log(" ", k));
  process.exit(0);
}

if (MODE_CHECK || MODE_UPLOAD) {
  checkConfig();
  const expected = collectExpected();
  console.log(`\n🗂   ${expected.size} images référencées dans les JSONs produits`);

  const r2Keys  = await listR2("media/produits/");
  const missing = [...expected.entries()].filter(([k]) => !r2Keys.has(k));
  const present = expected.size - missing.length;

  console.log(`✅  ${present} images déjà dans R2`);
  console.log(missing.length === 0 ? "\n🎉  Tout est synchronisé !" : `⚠️   ${missing.length} images manquantes\n`);

  if (missing.length === 0) process.exit(0);

  for (const [key, { produitId, localHint }] of missing) {
    console.log(`  ✗  ${key}  (produit: ${produitId}, fichier: ${localHint})`);
  }

  if (!MODE_UPLOAD) {
    console.log('\n💡  Pour uploader : node scripts/sync-r2.mjs --upload --source "C:\\chemin\\images"');
    process.exit(0);
  }

  if (!SOURCE_DIR || !existsSync(SOURCE_DIR)) {
    console.error(`\n❌  --source requis et dossier existant (reçu: ${SOURCE_DIR})`);
    process.exit(1);
  }

  console.log(`\n📤  Upload depuis : ${SOURCE_DIR}\n`);
  let uploaded = 0, skipped = 0;

  for (const [key, { localHint }] of missing) {
    const local = findLocal(localHint, SOURCE_DIR);
    if (!local) {
      console.log(`  ⏭  ${localHint}  → introuvable`);
      skipped++;
      continue;
    }
    process.stdout.write(`  ⬆  ${basename(local)}  →  ${basename(key)}  … `);
    try {
      const ok = await uploadFile(local, key);
      console.log(ok ? "✅" : "❌ (erreur serveur)");
      if (ok) uploaded++;
    } catch (e) {
      console.log(`❌ (${e.message})`);
    }
  }

  console.log(`\n📊  ${uploaded} uploadés, ${skipped} ignorés`);
  process.exit(0);
}

console.log(`
sync-r2.mjs — Bucket: ${BUCKET}

Variables requises :
  $env:R2_ACCESS_KEY_ID     = "..."
  $env:R2_SECRET_ACCESS_KEY = "..."
  $env:R2_ACCOUNT_ID        = "..."

Commandes :
  --list                     Lister les objets dans R2
  --check                    Comparer JSONs vs R2
  --upload --source <dossier> Uploader les images manquantes

Créer les credentials R2 :
  dash.cloudflare.com → R2 → Manage R2 API Tokens → Create API Token
`);
