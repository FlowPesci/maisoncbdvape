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

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BASE = "maisoncbdvape-stocks";

// ── 1. Les clés de stock que le SERVEUR ira chercher ───────────────────────
//
// ⚠ Ne JAMAIS reconstruire `id::label` ici. La première version le faisait, et
//   elle a proposé le 2026-10-02 de renommer `amnesia-hydro-indoor-cbd` (250 g
//   de vrac, la bonne ligne) en `amnesia-hydro-indoor-cbd::4g` — trois fois de
//   suite sur la même ligne, pour trois conditionnements. La première commande
//   aurait passé, les deux autres n'auraient rien trouvé, et la fiche serait
//   restée invendable avec son stock réel sur une clé que personne n'interroge.
//
//   **Une fleur au gramme n'a PAS de ligne par conditionnement.** Son stock est
//   un vrac en grammes porté par la clé du PRODUIT, et un sachet de 4 g en
//   retire 4 (`facteur`). C'est `resoudreStock()` qui porte cette règle, et
//   `CLES_STOCK` en est la table, générée par `build-catalog-index.js`.
//
//   D'où la correction : on lit la table que le serveur lit. Reconstruire la
//   clé, c'était écrire la règle une deuxième fois — exactement la faute que
//   `prix-fiche.mjs` existe pour empêcher côté tarifs.
const { CLES_STOCK, NOMS_STOCK } = await import("../functions/_shared/catalog-index.js");

const attendues = new Map(); // clé de stock → libellé lisible

for (const [reference, r] of Object.entries(CLES_STOCK)) {
  if (!r?.cle) continue;
  // Plusieurs références mènent à la même ligne (les 3 grammages d'une fleur) :
  // on garde le premier libellé rencontré, le plus court étant le produit.
  if (!attendues.has(r.cle)) {
    attendues.set(r.cle, NOMS_STOCK?.[r.cle] || reference.split("::")[0]);
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

  // Le conseil « relancer » ne vaut QUE pour le refus transitoire 10000. Le
  // déclencher sur « CLOUDFLARE_API_TOKEN manquant » enverrait relancer en
  // boucle une commande qui ne passera jamais.
  if (/\b10000\b|Authentication error/i.test(detail)) {
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
//
// ⚠ Deux garde-fous, nés du même incident :
//
//   1. Les DEUX clés doivent porter un libellé non vide. Sans ça,
//      `"4g".startsWith("")` est vrai, et toute variante s'appariait à la
//      ligne nue du produit — c'est ce qui a produit les renommages
//      destructeurs du 2026-10-02.
//   2. Une ligne orpheline ne peut être proposée qu'UNE fois. Trois commandes
//      renommant la même ligne source s'exécutent dans l'ordre : la première
//      passe, les suivantes ne trouvent plus rien, et le silence tient lieu de
//      confirmation.
//   3. L'appariement doit être UNIQUE DANS LES DEUX SENS. « p::Fraise » peut
//      correspondre à « p::Fraise Glacée » comme à « p::Fraise Kiwi » : en
//      prendre une au hasard déplacerait un stock réel sur la mauvaise saveur,
//      et l'erreur ne se verrait qu'à la première vente refusée. Dans ce cas on
//      ne propose RIEN et on laisse la clé en « vendue sans ligne ».
const normal = (s) => s.toLowerCase().replace(/[‘’]/g, "'").trim();

const partie = (c) => {
  const i = c.indexOf("::");
  return i === -1 ? null : { prod: c.slice(0, i), lab: normal(c.slice(i + 2)) };
};
const compatible = (a, b) => {
  const x = partie(a), y = partie(b);
  // garde-fou 1 : les deux doivent porter un libellé non vide
  if (!x || !y || !x.lab || !y.lab) return false;
  if (x.prod !== y.prod) return false;
  return x.lab.startsWith(y.lab) || y.lab.startsWith(x.lab);
};

const couples = [];
for (const m of manquantes) {
  const candidats = orphelines.filter((o) => compatible(m, o));
  if (candidats.length !== 1) continue;
  // garde-fous 2 et 3 : l'orpheline retenue ne doit convenir qu'à CETTE clé
  const inverse = manquantes.filter((autre) => compatible(autre, candidats[0]));
  if (inverse.length !== 1) continue;
  couples.push([candidats[0], m]);
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

// ── 4. Un PRODUIT entier re-slugué ─────────────────────────────────────────
//
// Cas trouvé le 2026-10-02, et que la comparaison variante par variante ne
// pouvait pas voir : le commerçant a recréé une fiche sous un nouvel
// identifiant. `al-fakher-crown-bar-30k-20mg` porte 30 lignes de stock avec des
// quantités réelles ; la fiche vendue s'appelle maintenant `pod-al-fakher-50k`
// et n'a aucune ligne. Les saveurs, elles, n'ont pas bougé.
//
// On ne peut pas le deviner en comparant les clés une à une — il faut comparer
// les ENSEMBLES de libellés. Deux produits dont les saveurs coïncident
// largement sont le même produit sous deux noms.
//
// ⚠ Exigeant volontairement : au moins 3 libellés identiques ET les deux tiers
//   de l'ancien ensemble retrouvés. En dessous, deux produits d'une même marque
//   partagent simplement des saveurs communes (« Mint », « Lush Ice »…) et les
//   confondre déplacerait des dizaines de lignes de stock sur la mauvaise fiche.
const parProduit = (cles) => {
  const m = new Map();
  for (const c of cles) {
    const i = c.indexOf("::");
    if (i === -1) continue;
    const prod = c.slice(0, i), lab = normal(c.slice(i + 2));
    if (!lab) continue;
    if (!m.has(prod)) m.set(prod, new Map());
    m.get(prod).set(lab, c);
  }
  return m;
};

const vieuxProduits = parProduit(vraimentOrphelines);
const neufsProduits = parProduit(vraimentManquantes);
const reslugs = [];

for (const [neuf, labelsNeufs] of neufsProduits) {
  const scores = [];
  for (const [vieux, labelsVieux] of vieuxProduits) {
    let communs = 0;
    for (const lab of labelsVieux.keys()) if (labelsNeufs.has(lab)) communs++;
    if (communs >= 3 && communs >= labelsVieux.size * (2 / 3)) {
      scores.push({ vieux, communs, total: labelsVieux.size });
    }
  }
  // Un seul candidat, sinon on ne tranche pas.
  if (scores.length === 1) reslugs.push({ neuf, ...scores[0] });
}

if (reslugs.length) {
  console.log(`⚠ ${reslugs.length} produit(s) semblent avoir CHANGÉ D'IDENTIFIANT.`);
  console.log("  Les lignes de stock sont restées sous l'ancien, avec les quantités");
  console.log("  réelles ; la fiche vendue sous le nouveau n'en a aucune.\n");

  for (const r of reslugs) {
    const labelsVieux = vieuxProduits.get(r.vieux);
    const labelsNeufs = neufsProduits.get(r.neuf);
    console.log(`   « ${r.vieux} »  →  « ${r.neuf} »`);
    console.log(`   ${r.communs} libellé(s) identiques sur ${r.total} côté base.\n`);

    const communs = [...labelsVieux.keys()].filter((l) => labelsNeufs.has(l));
    const perdus = [...labelsVieux.keys()].filter((l) => !labelsNeufs.has(l));

    // ⚠ AUCUN SQL n'est écrit ici, délibérément, à la différence du renommage
    //   de variante plus haut.
    //
    //   Un fabricant décline les MÊMES saveurs sur toute sa gamme : « Mint »,
    //   « Lush Ice », « Peach Ice » se retrouvent sur chacun de ses appareils.
    //   Un fort recoupement de libellés ne prouve donc pas que ce soit le même
    //   produit — et c'est exactement le cas rencontré le 2026-10-02, où
    //   `al-fakher-crown-bar-30k-20mg` (30 000 bouffées, supprimé) partageait
    //   33 saveurs avec `pod-al-fakher-50k` (50 000, actif) sans être le même
    //   appareil. Transférer le stock de l'un vers l'autre aurait vendu des
    //   unités qui n'existent pas.
    //
    //   Le script signale donc, et s'arrête là. Seul le commerçant sait si les
    //   deux identifiants désignent le même objet sur son étagère.
    console.log("   Quantités portées par l'ancienne fiche :\n");
    for (const lab of communs) {
      const l = enBase.get(labelsVieux.get(lab));
      console.log(`     ${labelsVieux.get(lab)}  → dispo ${l.dispo}, réservé ${l.reserve}`);
    }
    console.log("");
    console.log("   ⚠ AUCUNE commande n'est proposée ici, et c'est volontaire.");
    console.log("     Un fabricant décline les mêmes saveurs sur toute sa gamme :");
    console.log("     un recoupement de libellés ne prouve pas que ce soit le même");
    console.log("     appareil. Si ce sont DEUX produits distincts, ces quantités");
    console.log("     appartiennent à l'ancien et ne doivent pas être transférées —");
    console.log("     `db:seed` puis saisie des stocks réels est la bonne voie.");
    if (perdus.length) {
      console.log(`\n   ⚠ ${perdus.length} libellé(s) de l'ancienne fiche n'existent plus dans la`);
      console.log("     nouvelle — leurs lignes resteront orphelines, et c'est normal");
      console.log("     si ces saveurs ne sont plus vendues :");
      for (const lab of perdus) console.log(`       ${labelsVieux.get(lab)}`);
    }
    console.log("");
  }

  // ⚠ On ne RETIRE rien des listes ci-dessous. Tant que le commerçant n'a pas
  //   tranché, ces références restent vendues sans ligne de stock — c'est-à-dire
  //   invendables — et l'information doit rester visible. Les masquer sous
  //   prétexte qu'une piste existe reviendrait à présenter une hypothèse comme
  //   une correction.
}

// ⚠ Plus de troncature à 20 lignes. La première version coupait les listes, et
//   le 2026-10-02 c'est précisément dans les « +19 » masqués que se trouvait la
//   clé du diagnostic. Un outil qui cache une partie de ce qu'il a trouvé fait
//   chercher ailleurs.
if (vraimentManquantes.length) {
  console.log(`✕ ${vraimentManquantes.length} référence(s) VENDUE(S) sans ligne de stock —`);
  console.log("  toute commande les concernant est refusée en « vient d'être épuisé » :\n");
  for (const c of vraimentManquantes) console.log(`   ${c}`);
  console.log("\n  `npm run db:seed` les créera à la valeur de semis (10).\n");
}

if (vraimentOrphelines.length) {
  console.log(`⚠ ${vraimentOrphelines.length} ligne(s) de stock ne correspondent à rien de vendu`);
  console.log("  (produit supprimé ou désactivé). Sans effet sur les ventes —");
  console.log("  à nettoyer un jour, sans urgence :\n");
  for (const c of vraimentOrphelines) console.log(`   ${c}`);
  console.log("");
}

// ⚠ Sortie 0 même en cas d'écart : ce script est un outil de diagnostic, pas
//   un contrôle de build. Il ne tourne pas dans `npm run build` — il a besoin
//   du réseau et de la base distante, qu'une construction Cloudflare ne doit
//   pas avoir à joindre.
