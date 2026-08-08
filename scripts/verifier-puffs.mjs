/**
 * scripts/verifier-puffs.mjs
 * Contrôle de conformité des dispositifs de vapotage au regard de la
 * loi n° 2025-175 du 24 février 2025.
 *
 *   node scripts/verifier-puffs.mjs   → rapport, échoue si une fiche non conforme est active
 *
 * ─── Pourquoi ce script existe ────────────────────────────────────────────
 * Parce que le critère légal est contre-intuitif, et qu'une note antérieure
 * du dépôt l'avait écrit à l'envers.
 *
 * La loi interdit la fabrication, la mise sur le marché, la vente et l'offre
 * à titre gratuit d'un dispositif de vapotage **à quantité d'e-liquide fixe**.
 * Le texte ne parle pas de la batterie. Un appareil scellé doté d'un port
 * USB-C est parfaitement « rechargeable » au sens courant, et parfaitement
 * interdit au sens de la loi.
 *
 *   ⚠ LE TEST EST LE RÉSERVOIR, PAS LA PRISE.
 *
 * Amende jusqu'à 100 000 €, 200 000 € en récidive. C'est le risque le plus
 * lourd du catalogue, très loin devant tout le reste — et le seul qui se
 * déclenche sans qu'un client se plaigne.
 *
 * Le champ `liquideRemplissable` répond à cette seule question :
 *
 *   true   le client peut remettre du e-liquide dans l'appareil
 *          (flacon fourni, réservoir rechargeable, pod remplaçable)
 *   false  réservoir scellé, quantité fixe → VENTE INTERDITE
 *   null   on ne sait pas, la réponse du fournisseur est attendue
 *   absent identique à null
 *
 * Trois régimes, volontairement dissymétriques :
 *
 *   `false` sur une fiche active fait ÉCHOUER LE BUILD. C'est le seul cas où
 *   l'on sait avec certitude que le site propose un produit interdit. Aucune
 *   raison commerciale ne justifie de passer outre : on désactive la fiche
 *   (`actif: false`), on ne contourne pas le contrôle.
 *
 *   `null` AVERTIT sans bloquer. Bloquer reviendrait à empêcher tout
 *   déploiement du site tant qu'un fournisseur n'a pas répondu à un courriel —
 *   un contrôle qu'on finit par désactiver n'est plus un contrôle. Mais
 *   l'avertissement est bruyant et nominatif, pour que l'attente ne s'oublie
 *   pas dans le fil du build.
 *
 *   `true` demande en plus que la fiche le DISE au client. Une conformité que
 *   la fiche tait est une conformité invérifiable par l'acheteur — et par le
 *   contrôleur qui lirait la page. Simple avertissement.
 *
 * Les pods et flacons vendus seuls sont hors périmètre : l'interdiction porte
 * sur l'appareil à usage unique, pas sur la cartouche ou la recharge d'un
 * appareil réutilisable.
 * ─────────────────────────────────────────────────────────────────────────── */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "src/data-source/produits";

/** Sous-catégories de `puffs` qui ne sont pas des appareils. */
const HORS_PERIMETRE = new Set(["pods-recharges"]);

/**
 * Formulations qui, dans le texte public de la fiche, informent l'acheteur
 * que l'appareil se recharge en liquide.
 */
const DIT_REMPLISSABLE =
  /remplissable|rempla[çc]able|rechargeable|recharges? fournie|flacons? (?:de \d+ ?ml )?fourni|à remplir|se recharge/i;

const fiches = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ fichier: f, p: JSON.parse(readFileSync(join(DIR, f), "utf8")) }));

const appareils = fiches.filter(
  ({ p }) => p.categorie === "puffs" && !HORS_PERIMETRE.has(p.sousCategorie),
);

const interdits = [];
const inconnus = [];
const muets = [];

for (const { fichier, p } of appareils) {
  const slug = p.slug || fichier.replace(/\.json$/, "");
  const actif = p.actif !== false;

  // ⚠ Ne pas simplifier en `?? null`. Decap enregistre la valeur « À vérifier »
  // sous la forme d'une chaîne vide, pas d'un null : `"" ?? null` vaut `""`,
  // que la suite prendrait pour une réponse. Toute valeur qui n'est pas
  // strictement booléenne est une absence de réponse.
  const brut = p.liquideRemplissable;
  const etat = brut === true || brut === false ? brut : null;

  if (etat === false) {
    if (actif) interdits.push(slug);
    continue;
  }

  if (etat === null) {
    if (actif) inconnus.push(slug);
    continue;
  }

  // Déclaré conforme : la fiche doit le dire au client.
  const texte = [
    p.descriptionCourte,
    p.description,
    JSON.stringify(p.ficheTechnique || {}),
    JSON.stringify(p.pointsForts || []),
  ].join(" ");
  if (!DIT_REMPLISSABLE.test(texte)) muets.push(slug);
}

console.log(`\nConformité des dispositifs de vapotage — loi n° 2025-175`);
console.log(`${appareils.length} appareil(s) au catalogue, ${fiches.length - appareils.length} fiche(s) hors périmètre.\n`);

if (muets.length) {
  console.log(`⚠ ${muets.length} fiche(s) déclarée(s) remplissable(s) sans le dire au client :`);
  for (const s of muets) console.log(`    ${s}`);
  console.log(`  → l'ajouter en point fort ou en ligne de fiche technique.\n`);
}

if (inconnus.length) {
  console.log(`⚠ ${inconnus.length} fiche(s) EN LIGNE dont le réservoir n'est pas qualifié :`);
  for (const s of inconnus) console.log(`    ${s}`);
  console.log(`  → demander au fournisseur si l'e-liquide se recharge, puis renseigner`);
  console.log(`    "liquideRemplissable": true ou false.`);
  console.log(`  → si la réponse est « réservoir scellé », la vente est interdite :`);
  console.log(`    passer la fiche en "actif": false le jour même.\n`);
}

if (interdits.length) {
  console.error(`✗ ${interdits.length} appareil(s) à réservoir fixe PROPOSÉ(S) À LA VENTE :`);
  for (const s of interdits) console.error(`    ${s}`);
  console.error(`\n  La loi n° 2025-175 du 24 février 2025 interdit la mise sur le marché`);
  console.error(`  et la vente de ces dispositifs. Amende jusqu'à 100 000 €.`);
  console.error(`  → passer ces fiches en "actif": false.\n`);
  process.exit(1);
}

if (!muets.length && !inconnus.length) {
  console.log(`✓ Les ${appareils.length} appareils se rechargent en e-liquide, et leurs fiches le disent.\n`);
} else {
  console.log(`✓ Aucun appareil à réservoir fixe n'est proposé à la vente.\n`);
}
