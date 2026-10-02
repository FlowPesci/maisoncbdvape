/**
 * scripts/comparer-stocks-fiches.mjs
 * Compare les clés de la base de stocks aux libellés réellement vendus.
 *
 *   npm run db:comparer
 *
 * ─── Pourquoi ce script existe ────────────────────────────────────────────
 * Le 2026-10-02, le commerçant n'a pas pu passer une commande de test :
 * « Pod Al Fakher 50K · Summer Dream (Fruits d'été) » était annoncé **épuisé**
 * alors que l'écran des stocks en affichait 20.
 *
 * Les deux écrans disaient vrai, et ils ne parlaient pas du même objet :
 *
 *   fiche + catalogue  →  pod-al-fakher-50k::Summer Dream (Fruits d’été)
 *   base D1            →  pod-al-fakher-50k::Summer Dream
 *
 * Le commerçant avait renseigné la glose française **après** le semis de la
 * base. Renommer une variante dans l'éditeur de contenu change la clé de
 * stock — et **abandonne** l'ancienne ligne, qui garde les quantités, pendant
 * que la nouvelle n'existe pas.
 *
 * ⚠ C'est silencieux de bout en bout. `reserverPanier()` fait
 *   `UPDATE stocks … WHERE cle = ?` : zéro ligne touchée. Le `SELECT dispo`
 *   qui suit ne ramène rien, `ligne?.dispo ?? 0` vaut donc **0**, et le client
 *   lit « vient d'être épuisé ». Une ligne ABSENTE est indiscernable d'une
 *   ligne à ZÉRO. (Le message est corrigé par ailleurs, mais la cause est ici.)
 *
 * ⚠ `npm run db:seed` ne répare pas ça. Il est en `INSERT OR IGNORE` : il
 *   ajoutera la nouvelle clé **avec la quantité de semis**, et laissera
 *   l'ancienne avec le vrai stock. On se retrouve avec deux lignes, dont une
 *   morte — et un stock faux sur celle qui sert.
 *
 * Ce script ne modifie RIEN. Il lit, compare, et écrit les commandes SQL à
 * passer. C'est volontaire : un renommage de clé déplace des quantités
 * réelles, c'est au commerçant de valider ce qui correspond à quoi.
 *
 * ⚠ Une seule instruction par `--command` — voir CLAUDE.md. Le script en
 *   produit donc une par ligne, à passer une par une.
 * ─────────────────────────────────────────────────────────────────────────── */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { variantesVendables } from "./prix-fiche.mjs";

const DOSSIER = "src/data-source/produits";
const BASE = "maisoncbdvape-stocks";

// ── 1. Ce que le site vend réellement ──────────────────────────────────────
//
// On passe par `variantesVendables()` — la même fonction que l'affichage et
// que le catalogue serveur. Lire `fiche.variantes` brut ferait diverger ce
// contrôle de ce qui est réellement vendu, ce qui est exactement le défaut
// qu'il cherche.
const attendues = new Map(); // clé → libellé lisible

for (const nom of readdirSync(DOSSIER).filter((f) => f.endsWith(".json"))) {
  const fiche = JSON.parse(readFileSync(join(DOSSIER, nom), "utf8"));
  if (fiche.actif === false) continue;
  const slug = nom.replace(/\.json$/, "");
  const variantes = variantesVendables(fiche);

  if (variantes.length) {
    for (const v of variantes) {
      attendues.set(`${slug}::${v.label}`, `${fiche.nom} · ${v.label}`);
    }
  } else {
    attendues.set(slug, fiche.nom);
  }
}

// ── 2. Ce que la base contient ─────────────────────────────────────────────
//
// ⚠ On appelle le script de wrangler avec Node, PAS `npx`.
//
//   La première version lançait `npx.cmd` et échouait sous Windows sur
//   « spawnSync npx.cmd EINVAL ». Depuis Node 20, `execFileSync` refuse
//   d'exécuter un `.cmd` ou un `.bat` sans shell — c'est un durcissement
//   délibéré (CVE-2024-27980 : l'interpréteur de commandes Windows réinterprète
//   les arguments, ce qui permettait une injection).
//
//   Passer `shell: true` lèverait l'erreur, mais rendrait la citation des
//   arguments dépendante du shell — et l'un d'eux est une requête SQL pleine
//   d'espaces et d'apostrophes. Appeler directement le point d'entrée JS de
//   wrangler évite les deux problèmes : aucun shell, donc aucune citation.
let lignes;
try {
  const wrangler = fileURLToPath(import.meta.resolve("wrangler/bin/wrangler.js"));
  const brut = execFileSync(
    process.execPath,
    [wrangler, "d1", "execute", BASE, "--remote", "--json",
     "--command", "SELECT cle, dispo, reserve FROM stocks"],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 16 },
  );
  // wrangler préfixe parfois sa sortie de lignes d'information : on repart du
  // premier crochet.
  const json = JSON.parse(brut.slice(brut.indexOf("[")));
  lignes = json[0]?.results ?? [];
} catch (err) {
  // ⚠ Ne PAS accuser l'authentification par défaut. La première version de ce
  //   script affichait le conseil « relancer » quelle que soit l'erreur : le
  //   2026-10-02, elle a donc présenté un `spawnSync npx.cmd EINVAL` — un
  //   défaut du script lui-même — comme un refus de jeton. C'est la faute que
  //   `_shared/email.js` a déjà payée : afficher son interprétation à la place
  //   de ce que le fournisseur a répondu.
  const detail = [err.stderr, err.stdout, err.message]
    .map((x) => (x ? String(x) : "")).join("\n").trim();

  console.error("[stocks] ✕ lecture de la base impossible.\n");
  for (const l of detail.split("\n").slice(0, 12)) console.error("        " + l);

  if (/authentication|10000|login|token/i.test(detail)) {
    console.error("");
    console.error("        ⚠ La PREMIÈRE commande wrangler d'une session échoue");
    console.error("          systématiquement (Authentication error 10000), puis");
    console.error("          les suivantes passent. Relancer, simplement.");
  }
  process.exit(1);
}

const enBase = new Map(lignes.map((l) => [l.cle, l]));

// ── 3. Comparaison ─────────────────────────────────────────────────────────
const manquantes = [...attendues.keys()].filter((c) => !enBase.has(c));
const orphelines = [...enBase.keys()].filter((c) => !attendues.has(c));

console.log(`[stocks] ${enBase.size} ligne(s) en base, ${attendues.size} référence(s) vendue(s).\n`);

if (!manquantes.length && !orphelines.length) {
  console.log("[stocks] ✓ chaque référence vendue a sa ligne, aucune ligne orpheline.");
  process.exit(0);
}

// Appariement : une clé manquante et une clé orpheline qui partagent le même
// produit et dont l'un des libellés commence par l'autre sont très
// probablement la même variante renommée (« Summer Dream » → « Summer Dream
// (Fruits d'été) »).
//
// ⚠ On PROPOSE, on ne décide pas. Deux saveurs peuvent légitimement partager
//   un préfixe, et déplacer un stock sur la mauvaise ligne ne se voit qu'à la
//   première vente refusée.
const normal = (s) => s.toLowerCase().replace(/[‘’]/g, "'").trim();
const couples = [];

for (const m of manquantes) {
  const [prodM, labM = ""] = m.split("::");
  const candidats = orphelines.filter((o) => {
    const [prodO, labO = ""] = o.split("::");
    if (prodO !== prodM) return false;
    const a = normal(labM), b = normal(labO);
    return a.startsWith(b) || b.startsWith(a);
  });
  if (candidats.length === 1) couples.push([candidats[0], m]);
}

const apparies = new Set(couples.flat());

if (couples.length) {
  console.log(`⚠ ${couples.length} variante(s) probablement RENOMMÉE(S) — la ligne existe`);
  console.log("  sous l'ancien nom et porte le stock réel :\n");
  for (const [vieux, neuf] of couples) {
    const l = enBase.get(vieux);
    console.log(`   « ${vieux} »  (dispo ${l.dispo}, réservé ${l.reserve})`);
    console.log(`   → « ${neuf} »\n`);
  }
  console.log("  Commandes à passer, UNE PAR UNE (voir CLAUDE.md : une seule");
  console.log("  instruction par --command, et vérifier par un SELECT après coup) :\n");
  for (const [vieux, neuf] of couples) {
    const sql = `UPDATE stocks SET cle = '${neuf.replace(/'/g, "''")}' WHERE cle = '${vieux.replace(/'/g, "''")}'`;
    console.log(`   npx wrangler d1 execute ${BASE} --remote --command "${sql}"`);
  }
  console.log("");
  console.log("  ⚠ Renommer plutôt que recréer : la ligne porte le stock réel,");
  console.log("    et `db:seed` créerait la nouvelle à la valeur de semis en");
  console.log("    laissant l'ancienne derrière.");
  console.log("");
  console.log("  ⚠ La table `mouvements` garde l'ancienne clé dans son journal.");
  console.log("    C'est voulu : une trace réécrite n'est plus une trace.\n");
}

const vraimentManquantes = manquantes.filter((c) => !apparies.has(c));
const vraimentOrphelines = orphelines.filter((c) => !apparies.has(c));

if (vraimentManquantes.length) {
  console.log(`✕ ${vraimentManquantes.length} référence(s) VENDUE(S) sans ligne de stock —`);
  console.log("  toute commande les concernant est refusée en « vient d'être épuisé » :\n");
  for (const c of vraimentManquantes.slice(0, 20)) console.log(`   ${c}`);
  if (vraimentManquantes.length > 20) console.log(`   … +${vraimentManquantes.length - 20}`);
  console.log("\n  `npm run db:seed` les créera à la valeur de semis.\n");
}

if (vraimentOrphelines.length) {
  console.log(`⚠ ${vraimentOrphelines.length} ligne(s) de stock ne correspondent à rien de vendu`);
  console.log("  (produit supprimé ou désactivé). Sans effet sur les ventes —");
  console.log("  à nettoyer un jour, sans urgence :\n");
  for (const c of vraimentOrphelines.slice(0, 20)) console.log(`   ${c}`);
  if (vraimentOrphelines.length > 20) console.log(`   … +${vraimentOrphelines.length - 20}`);
  console.log("");
}

// ⚠ Sortie 0 même en cas d'écart : ce script est un outil de diagnostic, pas
//   un contrôle de build. Il ne tourne pas dans `npm run build` — il a besoin
//   du réseau et de la base distante, qu'une construction Cloudflare ne doit
//   pas avoir à joindre.
