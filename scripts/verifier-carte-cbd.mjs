/**
 * scripts/verifier-carte-cbd.mjs — `npm run verify:carte`
 *
 * ─── Pourquoi ce contrôle existe ──────────────────────────────────────────
 * La carte CBD de `/categories/cbd/` est le seul écran du site qui mélange
 * données de fiches et choix éditoriaux. Trois défauts y ont coexisté sans
 * que rien ne les signale, jusqu'au 2026-09-27 :
 *
 *  1. Les drapeaux étaient écrits en dur, PAR PANNEAU. Le Moon Rock
 *     affichait 🇫🇷 sur la carte alors que sa propre fiche annonce « Union
 *     européenne ». Une origine est une mention commerciale (L121-2), au même
 *     titre qu'un prix : deux versions sur le même site, c'est la famille de
 *     défaut que `prix-fiche.mjs` a fermée côté tarifs.
 *  2. Les deux têtes d'affiche étaient appelées par identifiant. Désactiver
 *     l'une depuis l'éditeur de contenu vidait sa ligne — nom absent, lien
 *     vers `/produits//` — sans erreur ni message.
 *  3. Le panneau « Greenhouse » affichait la même liste que « Small Buds ».
 *     Le même produit paraissait deux fois.
 *
 * Aucun contrôle existant ne pouvait les attraper : Eleventy construit sans
 * broncher sur une variable indéfinie, et le HTML produit est valide. Seul
 * l'œil sur la page rendue les voyait — et la carte n'est pas dans la passe
 * visuelle habituelle.
 *
 * Ce script vérifie ce qu'un humain ne relira pas à chaque déploiement :
 *  A. les identifiants encore écrits dans le gabarit existent et sont actifs ;
 *  B. aucune origine de fiche n'est inconnue de `origines.mjs` ;
 *  C. la liste d'origines de `config.yml` n'a pas divergé de `origines.mjs` ;
 *  D. la carte a au moins une vedette (sinon sa colonne de tête est muette) ;
 *  E. aucun drapeau n'est réapparu en dur dans le gabarit.
 * ────────────────────────────────────────────────────────────────────────── */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { ORIGINES, VALEURS_ORIGINE } from "./origines.mjs";

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, "..");
const FICHES = join(RACINE, "src", "data-source", "produits");
const GABARIT = join(RACINE, "src", "categories", "categorie.njk");
const CONFIG_CMS = join(RACINE, "admin", "contenu", "config.yml");

const erreurs = [];
const avertissements = [];

/* ── Chargement des fiches, avec le même filtre que src/_data/produits.js ── */
const toutes = readdirSync(FICHES)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ fichier: f, ...JSON.parse(readFileSync(join(FICHES, f), "utf8")) }));

const actives = toutes.filter((p) => p.actif !== false);
const parId = new Map(actives.map((p) => [p.id, p]));
const gabarit = readFileSync(GABARIT, "utf8");

/* ── A. Les identifiants écrits dans le gabarit ───────────────────────────
   On les relève dans le gabarit plutôt que de les recopier ici : une liste
   tenue à la main dans le contrôle diverge du gabarit qu'elle contrôle. */
const idsEnDur = [...gabarit.matchAll(/where\(\s*"id"\s*,\s*"([^"]+)"\s*\)/g)].map(
  (m) => m[1],
);

for (const id of new Set(idsEnDur)) {
  const fiche = toutes.find((p) => p.id === id);
  if (!fiche) {
    erreurs.push(
      `La carte CBD appelle le produit « ${id} », qui n'existe plus.\n` +
        `   → soit la fiche a été supprimée, soit son identifiant a changé.\n` +
        `   Retirer l'encart de src/categories/categorie.njk, ou rétablir la fiche.`,
    );
  } else if (fiche.actif === false) {
    erreurs.push(
      `La carte CBD appelle le produit « ${id} », désactivé dans l'éditeur de contenu.\n` +
        `   → sa ligne serait vide sur la page, sans message d'erreur.\n` +
        `   Le remettre actif, ou retirer l'encart de src/categories/categorie.njk.`,
    );
  }
}

/* ── B. Les origines saisies existent-elles ? ─────────────────────────────── */
for (const p of actives) {
  if (p.origine === undefined || p.origine === "") continue;
  if (!VALEURS_ORIGINE.includes(p.origine)) {
    erreurs.push(
      `${p.fichier} : origine « ${p.origine} » inconnue.\n` +
        `   Valeurs acceptées : ${VALEURS_ORIGINE.join(", ")}\n` +
        `   Une origine hors liste n'affiche AUCUN drapeau sur la carte, en silence.`,
    );
  }
}

/* ── B bis. La fiche technique a-t-elle la forme que l'éditeur sait écrire ?
   Le champ est déclaré `widget: list` dans config.yml, avec deux sous-champs
   `cle` et `valeur`. Les 139 fiches portaient un OBJET — Decap ne sait pas
   éditer un objet à clés libres, il tentait de le faire tenir dans sa liste
   et recopiait la valeur dans les deux sous-champs. Le commerçant voyait un
   formulaire incohérent et ne pouvait rien y modifier. Migrées en liste le
   2026-09-28 ; ce contrôle empêche le retour en arrière. */
for (const p of actives) {
  const ft = p.ficheTechnique;
  if (ft === undefined || ft === null) continue;
  if (Array.isArray(ft)) {
    const boiteuses = ft.filter((l) => !l || !(l.cle ?? l.label));
    if (boiteuses.length) {
      erreurs.push(
        `${p.fichier} : ${boiteuses.length} ligne(s) de fiche technique sans libellé.\n` +
          `   → elles s'affichent en lignes vides sur la page produit.`,
      );
    }
    continue;
  }
  if (typeof ft === "object" && Object.keys(ft).length) {
    erreurs.push(
      `${p.fichier} : fiche technique écrite en OBJET.\n` +
        `   L'éditeur de contenu déclare une liste de paires { cle, valeur } et ne sait\n` +
        `   pas éditer un objet à clés libres : le commerçant verrait un formulaire\n` +
        `   incohérent, avec la valeur recopiée dans les deux champs.\n` +
        `   → convertir en [{ "cle": …, "valeur": … }].`,
    );
  }
}

/* ── C. La copie de la liste dans config.yml a-t-elle divergé ? ───────────── */
const cms = readFileSync(CONFIG_CMS, "utf8");
const blocOrigine = cms.match(/name:\s*"origine"[\s\S]*?options:\s*\n([\s\S]*?)(?=\n\s*- label:|\n\s{0,6}#|\n\s*$)/);
if (!blocOrigine) {
  erreurs.push(
    `admin/contenu/config.yml : champ « origine » introuvable.\n` +
      `   Le commerçant ne pourrait plus saisir d'origine depuis l'éditeur de contenu.`,
  );
} else {
  const valeursCms = [...blocOrigine[1].matchAll(/value:\s*"([^"]+)"/g)].map((m) => m[1]);
  const attendues = VALEURS_ORIGINE;
  const manquantes = attendues.filter((v) => !valeursCms.includes(v));
  const enTrop = valeursCms.filter((v) => !attendues.includes(v));
  if (manquantes.length || enTrop.length) {
    erreurs.push(
      `La liste des origines a divergé entre scripts/origines.mjs et admin/contenu/config.yml.\n` +
        (manquantes.length ? `   Absentes de config.yml : ${manquantes.join(", ")}\n` : "") +
        (enTrop.length ? `   En trop dans config.yml : ${enTrop.join(", ")}\n` : "") +
        `   config.yml est recopié tel quel vers public/ : sa liste ne peut pas être\n` +
        `   générée, elle doit être tenue à la main. C'est pour ça que ce contrôle existe.`,
    );
  }
}

/* ── D. La carte a-t-elle au moins une vedette ? ──────────────────────────── */
const vedettesCbd = actives.filter((p) => p.categorie === "cbd" && p.carteVedette === true);
if (vedettesCbd.length === 0) {
  erreurs.push(
    `Aucun produit CBD n'est coché « Mettre en avant sur la carte CBD ».\n` +
      `   La colonne de tête de la carte serait vide, sous un titre « Best Sellers ».\n` +
      `   Cocher la case sur une ou deux fiches depuis /admin/contenu/.`,
  );
} else if (vedettesCbd.length > 4) {
  avertissements.push(
    `${vedettesCbd.length} produits sont mis en avant sur la carte. Au-delà de trois\n` +
      `   ou quatre, la mise en avant ne distingue plus rien.`,
  );
}

/* ── E. Un drapeau est-il réapparu en dur dans le gabarit ? ───────────────── */
const drapeauxConnus = ORIGINES.map((o) => o.drapeau).filter((d) => d !== "🌍");

// ⚠ Les commentaires Nunjucks sont retirés AVANT la recherche, et par bloc.
// Une première version filtrait ligne à ligne sur `{#` en début de ligne :
// elle a échoué sur ce fichier même, dont un commentaire multi-ligne cite un
// drapeau pour expliquer le défaut d'origine. Un contrôle qui se déclenche
// sur sa propre documentation finit par être désactivé.
const gabaritSansCommentaires = gabarit.replace(/\{#[\s\S]*?#\}/g, (bloc) =>
  bloc.replace(/[^\n]/g, " "),
);

for (const ligne of gabaritSansCommentaires.split("\n")) {
  for (const d of drapeauxConnus) {
    if (ligne.includes(d)) {
      erreurs.push(
        `Un drapeau « ${d} » est écrit en dur dans src/categories/categorie.njk :\n` +
          `   ${ligne.trim().slice(0, 100)}\n` +
          `   → passer par le filtre \`| drapeau\`, qui lit l'origine de la fiche.\n` +
          `   Un drapeau posé par le gabarit finit par contredire la fiche qu'il décrit.`,
      );
    }
  }
}

/* ── Produits CBD sans origine : on avertit, on ne bloque pas ─────────────── */
const sansOrigine = actives.filter(
  (p) => p.categorie === "cbd" && !p.origine,
);
if (sansOrigine.length) {
  avertissements.push(
    `${sansOrigine.length} produit(s) CBD sans origine — colonne « Orig. » vide sur la carte :\n` +
      sansOrigine.map((p) => `     ${p.id}`).join("\n") +
      `\n   Ne bloque pas : une origine absente vaut mieux qu'une origine inventée.`,
  );
}

/* ── Compte rendu ─────────────────────────────────────────────────────────── */
if (avertissements.length) {
  console.log("\n⚠  Avertissements — carte CBD\n");
  for (const a of avertissements) console.log("   " + a + "\n");
}

if (erreurs.length) {
  console.error("\n❌ Carte CBD — " + erreurs.length + " problème(s)\n");
  for (const e of erreurs) console.error("   " + e + "\n");
  process.exit(1);
}

console.log(
  `✅ Carte CBD : ${vedettesCbd.length} vedette(s), ` +
    `${actives.filter((p) => p.categorie === "cbd" && p.origine).length} origine(s) renseignée(s), ` +
    `aucun drapeau en dur.`,
);
