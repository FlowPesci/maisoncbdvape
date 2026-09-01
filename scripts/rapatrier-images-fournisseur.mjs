/**
 * scripts/rapatrier-images-fournisseur.mjs
 * Rapatrie dans R2 les images de fiches encore hébergées chez un tiers.
 *
 *   node scripts/rapatrier-images-fournisseur.mjs --dry-run   → liste, n'écrit rien
 *   node scripts/rapatrier-images-fournisseur.mjs             → télécharge, envoie, réécrit
 *
 * ─── Pourquoi ce script existe ────────────────────────────────────────────
 * Douze fiches affichent une image servie depuis `eproshopping.cloud`, le
 * serveur d'un grossiste. Trois raisons de ne pas laisser ça en production :
 *
 *   Elles peuvent disparaître sans préavis. Le grossiste réorganise son
 *   catalogue et douze fiches produits perdent leur visuel, sans que rien
 *   ne l'signale — ni au commerçant, ni au build.
 *
 *   C'est un appel tiers. Le site n'en a plus aucun depuis que les polices
 *   Google ont été rapatriées ; chaque visiteur d'une de ces douze fiches
 *   voit pourtant son adresse IP partir chez un prestataire qui n'a rien à
 *   voir avec la boutique.
 *
 *   Et la page dépend d'un serveur dont personne ici ne maîtrise ni la
 *   disponibilité, ni la vitesse, ni la politique de cache.
 *
 * ⚠ CES IMAGES NE SONT PAS FILIGRANÉES, ET NE DOIVENT PAS L'ÊTRE.
 * Ce sont des photographies de fournisseur. Les héberger pour vendre les
 * produits concernés est l'usage courant du commerce ; y apposer la marque
 * de la boutique reviendrait à revendiquer une paternité qu'elle n'a pas.
 * Le filigrane de `admin/contenu/media-library.js` ne s'applique qu'aux
 * visuels envoyés par le commerçant.
 *
 * ─── Sécurités ────────────────────────────────────────────────────────────
 * Le script est **rejouable** : une fiche dont l'image est déjà locale est
 * ignorée. Il ne réécrit la fiche **qu'après** un envoi R2 réussi — un
 * échec laisse la fiche intacte et pointant vers l'ancienne URL, ce qui est
 * dégradé mais pas cassé. Et il vérifie que ce qui a été téléchargé est
 * bien une image avant de l'envoyer : sans ce contrôle, une page d'erreur
 * HTML finirait stockée sous un nom en `.png` et la fiche afficherait un
 * cadre vide sans que rien ne proteste.
 * ─────────────────────────────────────────────────────────────────────────── */

import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const DIR = "src/data-source/produits";
const PREFIXE = "produits";
const SEC = process.argv.includes("--dry-run");

/** Le nom du bucket vit dans wrangler.toml — source unique. */
function bucket() {
  const toml = readFileSync("wrangler.toml", "utf8");
  const m = toml.match(/\[\[r2_buckets\]\][\s\S]*?bucket_name\s*=\s*"([^"]+)"/);
  if (!m) throw new Error("bucket_name introuvable dans wrangler.toml");
  return m[1];
}

/** Signatures de fichiers : le Content-Type d'un serveur tiers peut mentir. */
function typeReel(buf) {
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

const fiches = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ fichier: f, chemin: join(DIR, f), p: JSON.parse(readFileSync(join(DIR, f), "utf8")) }))
  .filter(({ p }) => typeof p.image === "string" && /^https?:\/\//i.test(p.image));

if (!fiches.length) {
  console.log("\n✓ Aucune image externe : tout est déjà hébergé sur le domaine.\n");
  process.exit(0);
}

const hotes = [...new Set(fiches.map(({ p }) => new URL(p.image).hostname))];
console.log(`\n${fiches.length} fiche(s) pointent encore vers un hébergeur tiers : ${hotes.join(", ")}\n`);

if (SEC) {
  for (const { p, fichier } of fiches) {
    console.log(`  ${(p.slug || fichier.replace(/\.json$/, "")).padEnd(42)} ${p.image}`);
  }
  console.log(`\n(--dry-run : rien n'a été téléchargé, envoyé ni modifié.)\n`);
  process.exit(0);
}

const BUCKET = bucket();
const travail = mkdtempSync(join(tmpdir(), "mcv-medias-"));
let ok = 0;
const echecs = [];

try {
  for (const { p, chemin, fichier } of fiches) {
    const slug = p.slug || fichier.replace(/\.json$/, "");
    process.stdout.write(`  ${slug.padEnd(42)} `);

    let buf;
    try {
      const res = await fetch(p.image, { redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      console.log(`✗ téléchargement : ${e.message}`);
      echecs.push([slug, e.message]);
      continue;
    }

    const type = typeReel(buf);
    if (!type) {
      console.log(`✗ le fichier reçu n'est pas une image (${buf.length} octets)`);
      echecs.push([slug, "contenu non reconnu comme image"]);
      continue;
    }

    // Même convention de nommage que les envois du back-office.
    const nom = `${Date.now()}-${slug}.${type.ext}`;
    const cle = `${PREFIXE}/${nom}`;
    const local = join(travail, nom);
    writeFileSync(local, buf);

    try {
      // ⚠ `shell: true` est indispensable ici. Sous Windows, `npx` est un
      // `npx.cmd` : le lancer sans shell échoue en ENOENT, et l'erreur ne
      // dit rien d'utile — on croirait à un problème d'identifiants R2 alors
      // que c'est la commande elle-même qui n'a jamais démarré.
      //
      // Aucun identifiant à fournir, justement : wrangler réutilise la
      // session OAuth déjà en place sur le poste, la même que celle de
      // `npm run db:etat`. Créer un jeton d'API R2 pour ce script serait un
      // secret de plus à gérer, pour rien.
      execFileSync(
        "npx",
        ["wrangler", "r2", "object", "put", `${BUCKET}/${cle}`,
         "--file", local, "--content-type", type.mime, "--remote"],
        { stdio: "pipe", shell: true },
      );
    } catch (e) {
      const detail = (e.stderr?.toString() || e.message).trim().split("\n").pop();
      console.log(`✗ envoi R2 : ${detail}`);
      echecs.push([slug, detail]);
      continue;
    }

    // La fiche n'est réécrite qu'ici : après un envoi confirmé.
    p.image = `/media/${cle}`;
    writeFileSync(chemin, JSON.stringify(p, null, 2) + "\n");
    console.log(`✓ ${Math.round(buf.length / 1024)} ko → /media/${cle}`);
    ok++;
  }
} finally {
  rmSync(travail, { recursive: true, force: true });
}

console.log(`\n${ok} image(s) rapatriée(s), ${echecs.length} échec(s).`);
if (echecs.length) {
  console.log(`\nLes fiches en échec pointent toujours vers l'hébergeur tiers :`);
  for (const [slug, why] of echecs) console.log(`  ${slug.padEnd(42)} ${why}`);
  console.log(`\nRelancer le script les reprendra : celles qui ont réussi sont ignorées.`);
}
console.log(`\n⚠ Relancer « npm run build » puis pousser pour que les fiches modifiées partent.\n`);
process.exit(echecs.length ? 1 : 0);
