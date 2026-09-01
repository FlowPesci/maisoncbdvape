/**
 * scripts/filigraner-medias.mjs
 * Applique le filigrane « maisoncbdvape.fr » aux images déjà présentes dans
 * R2 sous le préfixe `produits/`, en reproduisant exactement la logique de
 * `admin/contenu/media-library.js` → filigraner() : corps = largeur × 0.028
 * (min 11), marge = largeur × 0.025, bas à droite, blanc à 62 % avec ombre
 * portée sombre. Cette fonction-là tourne dans le navigateur via <canvas>,
 * au moment de l'envoi ; celle-ci fait le même calcul côté Node avec sharp,
 * pour les images déjà en ligne quand le filigrane n'existait pas encore.
 *
 *   node scripts/filigraner-medias.mjs --dry-run           → liste, n'écrit rien
 *   node scripts/filigraner-medias.mjs --dry-run --limit 3  → limite la liste
 *   node scripts/filigraner-medias.mjs --limit 3            → traite 3 images
 *   node scripts/filigraner-medias.mjs                      → traite tout le lot
 *
 * ⚠ CES IMAGES-LÀ NE SONT PAS CONCERNÉES : les visuels rapatriés d'un
 * grossiste (voir scripts/rapatrier-images-fournisseur.mjs et CLAUDE.md,
 * section Médias) ne doivent jamais être filigranés — apposer la marque de
 * la boutique sur une photo fournisseur reviendrait à revendiquer une
 * paternité qu'elle n'a pas. Douze fiches sont concernées aujourd'hui ; la
 * liste SLUGS_GROSSISTE plus bas les protège explicitement, y compris une
 * fois rapatriées dans R2 sous une clé qui, sinon, serait indiscernable
 * d'un envoi commerçant (même convention de nommage : voir
 * functions/api/media/upload.js). Si la liste des fiches grossiste change,
 * mettre à jour SLUGS_GROSSISTE en conséquence.
 *
 * ─── Sécurité : opération destructive et non rejouable ───────────────────
 * Chaque objet traité écrase l'original sous la même clé. Un second passage
 * marquerait une image déjà marquée. Avant toute modification, l'original
 * est donc copié (copie côté R2, pas de re-upload) sous le préfixe
 * `produits-avant-filigrane/<même nom>` — et le script REFUSE de traiter
 * une clé dont la copie existe déjà, pour ne jamais écraser une sauvegarde
 * ni marquer deux fois la même image.
 *
 * ─── Identification du format ─────────────────────────────────────────────
 * Le Content-Type stocké dans R2 peut être erroné (upload manuel, ancien
 * import) : le format réel est lu dans les octets du fichier, pas dans les
 * métadonnées. Le type d'origine est conservé à l'identique en sortie — un
 * PNG transparent repassé en JPEG prendrait un fond noir. Les SVG (tracés,
 * pas des photos) et tout ce qui n'est pas jpeg/png/webp sont ignorés,
 * exactement comme le fait `filigranable()` côté navigateur.
 *
 * ─── Config R2 (mêmes variables que scripts/sync-r2.mjs) ──────────────────
 *   $env:R2_ACCESS_KEY_ID     = "..."
 *   $env:R2_SECRET_ACCESS_KEY = "..."
 *   $env:R2_ACCOUNT_ID        = "..."
 * Credentials : dash.cloudflare.com → R2 → Manage R2 API Tokens.
 * ─────────────────────────────────────────────────────────────────────────── */

import { readFileSync, readdirSync } from "node:fs";
import { createHmac, createHash } from "node:crypto";
import { request } from "node:https";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "..");
const BUCKET    = "tabacgex-media";
const SRC_PREFIX    = "produits/";
const BACKUP_PREFIX = "produits-avant-filigrane/";

const FILIGRANE_TEXTE = "maisoncbdvape.fr";

/**
 * Fiches dont le visuel vient du grossiste (eproshopping.cloud) — voir
 * scripts/rapatrier-images-fournisseur.mjs. Aucune n'est dans R2 au moment
 * où ce script est écrit (elles pointent encore vers l'hébergeur tiers),
 * mais une fois rapatriées leur clé R2 (`produits/<horodatage>-<slug>.<ext>`)
 * est indiscernable d'un envoi commerçant : la protection reste donc utile
 * après coup, pas seulement aujourd'hui.
 */
const SLUGS_GROSSISTE = new Set([
  "baba-au-rhum-50-ml",
  "cake-noisettes-50-ml",
  "cannele-50-ml",
  "eclair-vanille-50-ml",
  "hash-primero",
  "jnr-falcon-gem-30k",
  "le-vanille",
  "mousse-chocolat-blanc-noisettes-50-ml",
  "palet-breton-50-ml",
  "riz-au-lait-50-ml",
  "tiramisu-cafe-50-ml",
  "zpluse-jnr-42k",
]);

/** true si la clé (hors extension) correspond à une fiche protégée. */
function estProtegeeGrossiste(key) {
  const stem = key.slice(SRC_PREFIX.length).replace(/\.[a-z0-9]+$/i, "");
  for (const slug of SLUGS_GROSSISTE) {
    if (stem === slug || stem.endsWith(`-${slug}`)) return true;
  }
  return false;
}

// ── Config R2 ──────────────────────────────────────────────────────────────
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
  (permissions : Object Read & Write sur le bucket ${BUCKET})
`);
    process.exit(1);
  }
}

const ENDPOINT_HOST = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;

// ══════════════════════════════════════════════════════════════════════════
// AWS Signature V4 (mêmes primitives que scripts/sync-r2.mjs)
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

/** Signe une requête S3 v4. `extraHeaders` : ex. x-amz-copy-source pour COPY. */
function signRequest({ method, path, query = "", body = Buffer.alloc(0), contentType = "", extraHeaders = {} }) {
  const now    = new Date();
  const date   = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const day    = date.slice(0, 8);
  const region = "auto";
  const service= "s3";

  const bodyHash = sha256hex(body);
  const headers  = {
    host: ENDPOINT_HOST,
    "x-amz-date": date,
    "x-amz-content-sha256": bodyHash,
    ...(contentType ? { "content-type": contentType } : {}),
    ...extraHeaders,
  };

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort()
    .map(k => `${k}:${headers[k]}\n`).join("");

  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, bodyHash].join("\n");
  const credentialScope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", date, credentialScope, sha256hex(canonicalRequest)].join("\n");
  const sigKey = getSigningKey(SECRET_KEY, day, region, service);
  const sig    = createHmac("sha256", sigKey).update(stringToSign).digest("hex");

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
  };
}

/** Requête HTTPS générique, réponse accumulée en Buffer (binaire-safe). */
function httpsRequest({ method, path, query = "", headers = {}, body = null }) {
  return new Promise((resolvePromise, reject) => {
    const fullPath = query ? `${path}?${query}` : path;
    const req = request({ hostname: ENDPOINT_HOST, path: fullPath, method, headers }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolvePromise({ status: res.statusCode, buffer: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Lister les objets sous un préfixe (pagination) ────────────────────────
async function listR2(prefix) {
  const keys = [];
  let continuationToken = null;

  do {
    const query = `list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`
      + (continuationToken ? `&continuation-token=${encodeURIComponent(continuationToken)}` : "");
    const path = `/${BUCKET}`;
    const headers = signRequest({ method: "GET", path, query });
    const res = await httpsRequest({ method: "GET", path, query, headers });

    if (res.status !== 200) {
      throw new Error(`Erreur R2 (HTTP ${res.status}) lors du listage de "${prefix}" :\n${res.buffer.toString("utf8")}`);
    }
    const body = res.buffer.toString("utf8");
    for (const m of body.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1]);

    const truncated = /<IsTruncated>true<\/IsTruncated>/i.test(body);
    const tokenMatch = body.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
    continuationToken = truncated ? tokenMatch?.[1] : null;
  } while (continuationToken);

  return keys;
}

// ── Télécharger un objet ───────────────────────────────────────────────────
async function getR2Object(key) {
  const path = `/${BUCKET}/${key}`;
  const headers = signRequest({ method: "GET", path });
  const res = await httpsRequest({ method: "GET", path, headers });
  if (res.status !== 200) {
    throw new Error(`GET ${key} → HTTP ${res.status} : ${res.buffer.toString("utf8").slice(0, 300)}`);
  }
  return res.buffer;
}

// ── Envoyer un objet ────────────────────────────────────────────────────────
async function putR2Object(key, buffer, contentType) {
  const path = `/${BUCKET}/${key}`;
  const headers = signRequest({ method: "PUT", path, body: buffer, contentType });
  const res = await httpsRequest({ method: "PUT", path, headers, body: buffer });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`PUT ${key} → HTTP ${res.status} : ${res.buffer.toString("utf8").slice(0, 300)}`);
  }
}

// ── Copier un objet côté serveur (pour la sauvegarde) ──────────────────────
async function copyR2Object(sourceKey, destKey) {
  const path = `/${BUCKET}/${destKey}`;
  const copySource = `/${BUCKET}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`;
  const headers = signRequest({ method: "PUT", path, extraHeaders: { "x-amz-copy-source": copySource } });
  const res = await httpsRequest({ method: "PUT", path, headers });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`COPY ${sourceKey} → ${destKey} : HTTP ${res.status} : ${res.buffer.toString("utf8").slice(0, 300)}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Identification du format réel (le Content-Type stocké peut être erroné)
// ══════════════════════════════════════════════════════════════════════════

function typeReel(buf) {
  const debut = buf.toString("utf8", 0, Math.min(300, buf.length)).trimStart();
  if (debut.startsWith("<?xml") || debut.startsWith("<svg")) return { ext: "svg", mime: "image/svg+xml" };
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.toString("latin1", 0, 8) === "\x89PNG\r\n\x1a\n") return { ext: "png", mime: "image/png" };
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") {
    return { ext: "webp", mime: "image/webp" };
  }
  if (buf.toString("latin1", 0, 6) === "GIF89a" || buf.toString("latin1", 0, 6) === "GIF87a") {
    return { ext: "gif", mime: "image/gif" };
  }
  return null;
}

/** Même critère que filigranable() dans admin/contenu/media-library.js. */
function filigranable(mime) {
  return /^image\/(jpeg|png|webp)$/.test(mime || "");
}

// ══════════════════════════════════════════════════════════════════════════
// Filigrane — reproduction de filigraner() (admin/contenu/media-library.js)
// ══════════════════════════════════════════════════════════════════════════

// La police est celle réellement chargée par le site (poids 500, comme dans
// ctx.font côté navigateur), embarquée dans le SVG en data URI : sharp/rsvg
// n'a pas accès aux @font-face du site, il faut lui fournir le fichier.
const DM_SANS_500 = readFileSync(
  join(ROOT, "src/assets/fonts/dm-sans-500-latin.woff2")
).toString("base64");

function xmlEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Construit le calque SVG du filigrane pour une image de `width` × `height`.
 * Formules identiques à filigraner() : corps, marge, ombre, couleur, position.
 */
function buildFiligraneSvg(width, height) {
  const corps = Math.max(11, Math.round(width * 0.028));
  const marge = Math.round(width * 0.025);
  // ctx.shadowBlur du canvas n'a pas d'équivalent direct en SVG ; stdDeviation
  // (feGaussianBlur/feDropShadow) correspond conventionnellement à la moitié
  // du rayon de flou CSS/canvas.
  const shadowBlur = Math.round(corps * 0.5);
  const stdDeviation = shadowBlur / 2;
  const x = width - marge;
  const y = height - marge;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<defs>
<style>
@font-face {
  font-family: 'DM Sans Filigrane';
  font-weight: 500;
  src: url(data:font/woff2;base64,${DM_SANS_500}) format('woff2');
}
</style>
<filter id="ombre" x="-50%" y="-50%" width="200%" height="200%">
  <feDropShadow dx="0" dy="1" stdDeviation="${stdDeviation}" flood-color="#000000" flood-opacity="0.55"/>
</filter>
</defs>
<text x="${x}" y="${y}" text-anchor="end" dominant-baseline="ideographic"
      font-family="'DM Sans Filigrane', 'DM Sans', system-ui, sans-serif" font-weight="500"
      font-size="${corps}" fill="rgba(255,255,255,0.62)" filter="url(#ombre)">${xmlEscape(FILIGRANE_TEXTE)}</text>
</svg>`;
}

/** Filigrane une image et renvoie un buffer dans le MÊME format d'origine. */
async function filigranerBuffer(buffer, mime) {
  const img = sharp(buffer);
  const meta = await img.metadata();
  const svg = buildFiligraneSvg(meta.width, meta.height);
  const composite = img.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);

  // On conserve le type d'origine : convertir un PNG à fond transparent en
  // JPEG lui donnerait un fond noir — même remarque que côté navigateur.
  if (mime === "image/png") return composite.png().toBuffer();
  if (mime === "image/webp") return composite.webp({ quality: 92 }).toBuffer();
  return composite.jpeg({ quality: 92 }).toBuffer();
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

async function main() {
  checkConfig();

  console.log(`📦  Listage de "${SRC_PREFIX}" dans ${BUCKET}…`);
  const toutesLesClefs = await listR2(SRC_PREFIX);
  console.log(`    ${toutesLesClefs.length} objet(s) trouvé(s)\n`);

  console.log(`📦  Listage des sauvegardes déjà faites ("${BACKUP_PREFIX}")…`);
  const clefsSauvegardees = new Set(
    (await listR2(BACKUP_PREFIX)).map(k => k.slice(BACKUP_PREFIX.length))
  );
  console.log(`    ${clefsSauvegardees.size} sauvegarde(s) existante(s)\n`);

  const eligibles = [];
  const ignorees = { svg: [], grossiste: [], dejaTraitee: [] };

  for (const key of toutesLesClefs) {
    const nomSansPrefixe = key.slice(SRC_PREFIX.length);
    if (/\.svg$/i.test(key)) { ignorees.svg.push(key); continue; }
    if (estProtegeeGrossiste(key)) { ignorees.grossiste.push(key); continue; }
    if (clefsSauvegardees.has(nomSansPrefixe)) { ignorees.dejaTraitee.push(key); continue; }
    eligibles.push(key);
  }

  const aTraiter = eligibles.slice(0, LIMIT);

  console.log(`✓ ${eligibles.length} image(s) éligible(s)${LIMIT < Infinity ? ` (limité à ${aTraiter.length} pour cette exécution)` : ""}`);
  if (ignorees.svg.length) console.log(`⏭ ${ignorees.svg.length} SVG ignoré(s)`);
  if (ignorees.grossiste.length) {
    console.log(`⏭ ${ignorees.grossiste.length} image(s) grossiste protégée(s) (jamais filigranées) :`);
    ignorees.grossiste.forEach(k => console.log(`    ${k}`));
  }
  if (ignorees.dejaTraitee.length) {
    console.log(`⏭ ${ignorees.dejaTraitee.length} image(s) déjà sauvegardée(s) (déjà traitées, on ne repasse pas) :`);
    ignorees.dejaTraitee.forEach(k => console.log(`    ${k}`));
  }
  console.log();

  if (DRY_RUN) {
    console.log(`(--dry-run : rien n'a été téléchargé, sauvegardé ni modifié.)\n`);
    aTraiter.forEach(k => console.log(`  ${k}`));
    console.log(`\n${aTraiter.length} image(s) seraient traitée(s).\n`);
    process.exit(0);
  }

  if (!aTraiter.length) {
    console.log("Rien à traiter.\n");
    process.exit(0);
  }

  let ok = 0, sautees = 0;
  const echecs = [];

  for (const key of aTraiter) {
    const nomSansPrefixe = key.slice(SRC_PREFIX.length);
    process.stdout.write(`  ${key.padEnd(60)} `);

    let buffer;
    try {
      buffer = await getR2Object(key);
    } catch (e) {
      console.log(`✗ téléchargement : ${e.message}`);
      echecs.push([key, e.message]);
      continue;
    }

    const type = typeReel(buffer);
    if (!type || !filigranable(type.mime)) {
      console.log(`⏭ ignorée (${type?.mime || "type non reconnu"})`);
      sautees++;
      continue;
    }

    // Sauvegarde avant toute modification — jamais l'inverse.
    const backupKey = BACKUP_PREFIX + nomSansPrefixe;
    try {
      await copyR2Object(key, backupKey);
    } catch (e) {
      console.log(`✗ sauvegarde : ${e.message}`);
      echecs.push([key, `sauvegarde : ${e.message}`]);
      continue;
    }

    let marquee;
    try {
      marquee = await filigranerBuffer(buffer, type.mime);
    } catch (e) {
      console.log(`✗ filigrane : ${e.message} (original sauvegardé, rien écrasé)`);
      echecs.push([key, `filigrane : ${e.message}`]);
      continue;
    }

    try {
      await putR2Object(key, marquee, type.mime);
    } catch (e) {
      console.log(`✗ envoi : ${e.message} (original sauvegardé sous ${backupKey})`);
      echecs.push([key, `envoi : ${e.message}`]);
      continue;
    }

    console.log(`✓ ${Math.round(buffer.length / 1024)} ko → ${Math.round(marquee.length / 1024)} ko`);
    ok++;
  }

  console.log(`\n${ok} image(s) filigranée(s), ${sautees} ignorée(s) au vol, ${echecs.length} échec(s).`);
  if (echecs.length) {
    console.log(`\nÉchecs (original intact ou sauvegardé, rien de perdu) :`);
    echecs.forEach(([k, why]) => console.log(`  ${k}\n    ${why}`));
  }
  process.exit(echecs.length ? 1 : 0);
}

main().catch(e => {
  console.error(`\n❌  ${e.message}\n`);
  process.exit(1);
});
