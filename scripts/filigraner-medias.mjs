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
 * ─── D'où vient la liste des clés ──────────────────────────────────────────
 * Pas de listage du bucket : R2 peut contenir des objets orphelins (anciens
 * envois, produits supprimés) qu'il serait inutile de filigraner et risqué
 * de réécrire. La liste vient des fiches, exactement comme le fait
 * scripts/rapatrier-images-fournisseur.mjs pour son propre travail : les
 * champs `image` et `galerie` de chaque src/data-source/produits/*.json qui
 * pointent vers `/media/produits/...` désignent les images réellement
 * affichées par le site — c'est la bonne liste au sens métier.
 *
 * ⚠ CES IMAGES-LÀ NE SONT PAS CONCERNÉES : les visuels rapatriés d'un
 * grossiste (voir scripts/rapatrier-images-fournisseur.mjs et CLAUDE.md,
 * section Médias) ne doivent jamais être filigranés — apposer la marque de
 * la boutique sur une photo fournisseur reviendrait à revendiquer une
 * paternité qu'elle n'a pas. Aujourd'hui ces fiches pointent encore vers un
 * hébergeur externe et sont donc naturellement hors du périmètre (elles ne
 * commencent pas par /media/produits/) ; SLUGS_GROSSISTE les protège aussi
 * explicitement pour le jour où `npm run medias:rapatrier` les aura fait
 * entrer dans R2 sous une clé qui, sinon, serait indiscernable d'un envoi
 * commerçant (même convention de nommage : voir functions/api/media/upload.js).
 *
 * ─── Sécurité : opération destructive et non rejouable ───────────────────
 * Chaque objet traité écrase l'original sous la même clé. Un second passage
 * marquerait une image déjà marquée. Avant toute modification, l'original
 * est donc envoyé sous le préfixe `produits-avant-filigrane/<même nom>` —
 * et le script REFUSE de traiter une clé dont la sauvegarde existe déjà,
 * pour ne jamais l'écraser ni marquer deux fois la même image.
 *
 * ─── Identification du format ─────────────────────────────────────────────
 * Le Content-Type stocké dans R2 peut être erroné : le format réel est lu
 * dans les octets du fichier, pas dans les métadonnées. Le type d'origine
 * est conservé à l'identique en sortie — un PNG transparent repassé en JPEG
 * prendrait un fond noir. Les SVG (tracés, pas des photos) et tout ce qui
 * n'est pas jpeg/png/webp sont ignorés, exactement comme le fait
 * `filigranable()` côté navigateur.
 *
 * ─── Accès R2 ───────────────────────────────────────────────────────────
 * Aucun jeton d'API : `wrangler r2 object get/put --remote` réutilise la
 * session OAuth déjà active sur ce poste (la même que `npm run db:etat`).
 * Pas de commande de listage d'objets dans wrangler — d'où la liste tirée
 * du catalogue plutôt que du bucket.
 * ─────────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "..");
const CATALOG_DIR    = join(ROOT, "src/data-source/produits");
const SRC_PREFIX      = "produits/";
const BACKUP_PREFIX   = "produits-avant-filigrane/";
const FILIGRANE_TEXTE = "maisoncbdvape.fr";

/** Le nom du bucket vit dans wrangler.toml — source unique (idem rapatrier-images-fournisseur.mjs). */
function bucket() {
  const toml = readFileSync(join(ROOT, "wrangler.toml"), "utf8");
  const m = toml.match(/\[\[r2_buckets\]\][\s\S]*?bucket_name\s*=\s*"([^"]+)"/);
  if (!m) throw new Error("bucket_name introuvable dans wrangler.toml");
  return m[1];
}
const BUCKET = bucket();

/**
 * Fiches dont le visuel vient du grossiste (eproshopping.cloud) — voir
 * scripts/rapatrier-images-fournisseur.mjs. Aucune n'est dans R2 au moment
 * où ce script est écrit (elles pointent encore vers l'hébergeur tiers, donc
 * hors du périmètre /media/produits/ de toute façon), mais une fois
 * rapatriées leur clé R2 devient indiscernable d'un envoi commerçant : la
 * protection reste utile après coup, pas seulement aujourd'hui.
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

// ══════════════════════════════════════════════════════════════════════════
// Liste des clés — dérivée du catalogue, pas d'un listage du bucket
// ══════════════════════════════════════════════════════════════════════════

function collectKeysFromCatalog() {
  const keys = new Set();
  let externes = 0;

  for (const f of readdirSync(CATALOG_DIR).filter(f => f.endsWith(".json"))) {
    const p = JSON.parse(readFileSync(join(CATALOG_DIR, f), "utf8"));
    const valeurs = [p.image, ...(Array.isArray(p.galerie) ? p.galerie : [])].filter(Boolean);
    for (const v of valeurs) {
      if (/^https?:\/\//i.test(v)) { externes++; continue; }
      if (v.startsWith("/media/" + SRC_PREFIX)) keys.add(v.replace(/^\/media\//, ""));
    }
  }
  return { keys: [...keys].sort(), externes };
}

/** Sécurité avant tout appel shell : n'accepter qu'un charset connu et sûr. */
function cleAcceptable(key) {
  return /^produits\/[A-Za-z0-9._-]+$/.test(key);
}

// ══════════════════════════════════════════════════════════════════════════
// Accès R2 via wrangler (--remote, session OAuth déjà active sur ce poste)
// ══════════════════════════════════════════════════════════════════════════

let TRAVAIL; // dossier temporaire partagé, créé dans main(), nettoyé à la fin

function wranglerGet(key) {
  const local = join(TRAVAIL, "get-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  execFileSync(
    "npx",
    ["wrangler", "r2", "object", "get", `${BUCKET}/${key}`, "--remote", "--file", local],
    { stdio: "pipe", shell: true },
  );
  const buf = readFileSync(local);
  rmSync(local, { force: true });
  return buf;
}

function wranglerPut(key, buffer, contentType) {
  const local = join(TRAVAIL, "put-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  writeFileSync(local, buffer);
  try {
    execFileSync(
      "npx",
      ["wrangler", "r2", "object", "put", `${BUCKET}/${key}`, "--file", local, "--content-type", contentType, "--remote"],
      { stdio: "pipe", shell: true },
    );
  } finally {
    rmSync(local, { force: true });
  }
}

/** Existence par tentative de lecture — wrangler n'a pas d'équivalent HEAD. */
function wranglerExists(key) {
  try {
    wranglerGet(key);
    return true;
  } catch {
    return false;
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
  // (feDropShadow) correspond conventionnellement à la moitié du rayon de
  // flou CSS/canvas.
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
  console.log(`🗂   Lecture du catalogue (${CATALOG_DIR})…`);
  const { keys: toutesLesClefs, externes } = collectKeysFromCatalog();
  console.log(`    ${toutesLesClefs.length} clé(s) distincte(s) sous ${SRC_PREFIX}, ${externes} référence(s) encore externe(s) (grossiste, hors périmètre)\n`);

  const eligibles = [];
  const ignorees = { svg: [], grossiste: [], invalide: [] };

  for (const key of toutesLesClefs) {
    if (!cleAcceptable(key)) { ignorees.invalide.push(key); continue; }
    if (/\.svg$/i.test(key)) { ignorees.svg.push(key); continue; }
    if (estProtegeeGrossiste(key)) { ignorees.grossiste.push(key); continue; }
    eligibles.push(key);
  }

  if (ignorees.invalide.length) {
    console.log(`⚠ ${ignorees.invalide.length} clé(s) au format inattendu, ignorée(s) par prudence :`);
    ignorees.invalide.forEach(k => console.log(`    ${k}`));
  }
  if (ignorees.svg.length) console.log(`⏭ ${ignorees.svg.length} SVG ignoré(s)`);
  if (ignorees.grossiste.length) {
    console.log(`⏭ ${ignorees.grossiste.length} image(s) grossiste protégée(s) (jamais filigranées) :`);
    ignorees.grossiste.forEach(k => console.log(`    ${k}`));
  }
  console.log();

  TRAVAIL = mkdtempSync(join(tmpdir(), "mcv-filigrane-"));
  try {
    let ok = 0, sautees = 0, dejaTraitees = 0;
    const echecs = [];
    const aTraiter = [];

    // Le contrôle "déjà sauvegardée ?" coûte un appel réseau par clé : on
    // l'accepte aussi en --dry-run pour donner un aperçu fidèle de ce qui
    // serait réellement traité (lecture seule, aucune écriture).
    for (const key of eligibles) {
      if (aTraiter.length >= LIMIT) break;
      const nomSansPrefixe = key.slice(SRC_PREFIX.length);
      const backupKey = BACKUP_PREFIX + nomSansPrefixe;
      process.stdout.write(`  vérification  ${key.padEnd(60)} `);
      if (wranglerExists(backupKey)) {
        console.log("⏭ déjà sauvegardée (déjà traitée)");
        dejaTraitees++;
        continue;
      }
      console.log("→ à traiter");
      aTraiter.push(key);
    }

    console.log(`\n✓ ${aTraiter.length} image(s) à traiter${dejaTraitees ? `, ${dejaTraitees} déjà traitée(s) ignorée(s)` : ""}\n`);

    if (DRY_RUN) {
      console.log("(--dry-run : rien n'a été modifié ni sauvegardé.)\n");
      aTraiter.forEach(k => console.log(`  ${k}`));
      console.log(`\n${aTraiter.length} image(s) seraient filigranées.\n`);
      return;
    }

    if (!aTraiter.length) {
      console.log("Rien à traiter.\n");
      return;
    }

    for (const key of aTraiter) {
      const nomSansPrefixe = key.slice(SRC_PREFIX.length);
      const backupKey = BACKUP_PREFIX + nomSansPrefixe;
      process.stdout.write(`  ${key.padEnd(60)} `);

      let buffer;
      try {
        buffer = wranglerGet(key);
      } catch (e) {
        console.log(`✗ téléchargement : ${e.message}`);
        echecs.push([key, `téléchargement : ${e.message}`]);
        continue;
      }

      const type = typeReel(buffer);
      if (!type || !filigranable(type.mime)) {
        console.log(`⏭ ignorée (${type?.mime || "type non reconnu"})`);
        sautees++;
        continue;
      }

      // Sauvegarde avant toute modification — jamais l'inverse.
      try {
        wranglerPut(backupKey, buffer, type.mime);
      } catch (e) {
        console.log(`✗ sauvegarde : ${e.message}`);
        echecs.push([key, `sauvegarde : ${e.message}`]);
        continue;
      }

      let marquee;
      try {
        marquee = await filigranerBuffer(buffer, type.mime);
      } catch (e) {
        console.log(`✗ filigrane : ${e.message} (original sauvegardé sous ${backupKey}, rien écrasé)`);
        echecs.push([key, `filigrane : ${e.message}`]);
        continue;
      }

      try {
        wranglerPut(key, marquee, type.mime);
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
    if (echecs.length) process.exitCode = 1;
  } finally {
    rmSync(TRAVAIL, { recursive: true, force: true });
  }
}

main().catch(e => {
  console.error(`\n❌  ${e.message}\n`);
  process.exit(1);
});
