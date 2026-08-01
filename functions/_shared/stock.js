/**
 * functions/_shared/stock.js
 * Réservation de stock — la seule voie d'écriture sur la table `stocks`.
 *
 * ─── Pourquoi ce module existe ────────────────────────────────────────────
 * Workers KV ne convient pas : cohérence éventuelle et aucune opération
 * atomique, donc deux commandes simultanées peuvent survendre. D1 est du
 * SQLite : une instruction UPDATE gardée par sa clause WHERE est atomique.
 *
 *   UPDATE stocks SET dispo = dispo - ?1 WHERE cle = ?2 AND dispo >= ?1
 *
 * Zéro ligne modifiée = stock insuffisant. Aucune lecture préalable, donc
 * aucune fenêtre de course entre la vérification et l'écriture.
 *
 * ─── Cycle de vie ─────────────────────────────────────────────────────────
 *   réservation → consommation   (paiement accepté, ou retrait sans paiement)
 *              → relâche         (paiement refusé, commande annulée)
 *              → expiration      (client parti sans payer)
 *
 * Une réservation n'est jamais supprimée : son état garantit l'idempotence
 * quand Monetico rejoue une notification.
 * ─────────────────────────────────────────────────────────────────────────── */

import { resoudreStock, uniteStock } from "./catalog-index.js";

/** Durée de vie d'une réservation non confirmée, en minutes. */
const EXPIRATION_MINUTES = 30;

/**
 * Garde-fou : sans binding D1, aucune commande ne doit pouvoir passer.
 *
 * Refuser explicitement vaut mieux que planter sur un `undefined`, et
 * infiniment mieux que vendre sans contrôler le stock. Si ce message
 * apparaît, c'est que le binding STOCKS_DB manque dans Cloudflare Pages.
 */
function exigeBase(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("Base de stocks indisponible (binding STOCKS_DB manquant)");
  }
}

/**
 * Traduit un article du panier en opération de stock.
 *
 * Deux modèles coexistent, et la différence est invisible pour l'appelant :
 *  · à l'unité — 1 article retire 1 du stock de sa propre clé
 *  · au poids  — les fleurs CBD sont pesées à la commande depuis un vrac.
 *                Le stock est en grammes sur le produit, et un sachet de 4 g
 *                en retire 4. Commander deux sachets de 4 g rend donc
 *                indisponible un sachet de 8 g s'il ne reste pas assez.
 *
 * @returns {{cle: string, quantite: number, unite: string}}
 */
export function operationStock(id, varianteLabel, qty) {
  const r = resoudreStock(id, varianteLabel || null);
  return { cle: r.cle, quantite: Number(qty) * r.facteur, unite: r.unite };
}

const maintenant = () => Date.now();

/** Trace un mouvement. Ne doit jamais faire échouer l'opération métier. */
function tracer(db, { cle, delta, motif, orderId = null, auteur = "systeme" }) {
  return db
    .prepare(
      "INSERT INTO mouvements (cle, delta, motif, orderId, auteur, creeLe) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
    )
    .bind(cle, delta, motif, orderId, auteur, maintenant());
}

/**
 * Rend le stock des réservations périmées.
 *
 * Appelée au fil de l'eau plutôt que par une tâche planifiée : le volume est
 * faible et cela évite une dépendance à un Cron Trigger.
 *
 * @returns {Promise<number>} nombre de réservations expirées
 */
export async function purgerExpirees(db) {
  exigeBase(db);
  const t = maintenant();
  const { results } = await db
    .prepare("SELECT orderId, cle, qty FROM reservations WHERE etat = 'active' AND expireLe < ?1")
    .bind(t)
    .all();

  if (!results?.length) return 0;

  const lots = [];
  for (const r of results) {
    lots.push(
      db.prepare(
        "UPDATE stocks SET dispo = dispo + ?1, reserve = MAX(0, reserve - ?1), majLe = ?2 WHERE cle = ?3"
      ).bind(r.qty, t, r.cle),
      db.prepare(
        "UPDATE reservations SET etat = 'relachee' WHERE orderId = ?1 AND cle = ?2 AND etat = 'active'"
      ).bind(r.orderId, r.cle),
      tracer(db, { cle: r.cle, delta: r.qty, motif: "expiration", orderId: r.orderId })
    );
  }
  await db.batch(lots);
  return results.length;
}

/**
 * Réserve tout le panier, ou rien.
 *
 * Le tout-ou-rien est essentiel : sans lui, un panier de trois articles dont
 * le dernier est en rupture laisserait les deux premiers réservés à vide.
 *
 * @param {D1Database} db
 * @param {string} orderId
 * @param {{id:string, nom:string, qty:number, varianteLabel?:string}[]} items
 * @returns {Promise<{ok:true} | {ok:false, erreur:string, article?:string}>}
 */
export async function reserverPanier(db, orderId, items) {
  try {
    exigeBase(db);
  } catch (e) {
    return { ok: false, erreur: "Commande momentanément indisponible. Réessayez dans quelques minutes." };
  }
  await purgerExpirees(db);

  const expireLe = maintenant() + EXPIRATION_MINUTES * 60_000;
  const reserves = [];

  for (const it of items) {
    const op = operationStock(it.id, it.varianteLabel, it.qty);

    // Le cœur du dispositif : atomique, sans lecture préalable.
    const res = await db
      .prepare("UPDATE stocks SET dispo = dispo - ?1, reserve = reserve + ?1, majLe = ?2 WHERE cle = ?3 AND dispo >= ?1")
      .bind(op.quantite, maintenant(), op.cle)
      .run();

    if (!res.meta.changes) {
      // Échec : on rend ce qui vient d'être pris pour cette commande
      await relacherPanier(db, orderId, reserves, "relache");

      const ligne = await db.prepare("SELECT dispo FROM stocks WHERE cle = ?1").bind(op.cle).first();
      const dispo = ligne?.dispo ?? 0;

      // Un produit au poids se raconte en grammes restants, pas en exemplaires
      let erreur;
      if (dispo <= 0) {
        erreur = `« ${it.nom} » vient d'être épuisé.`;
      } else if (op.unite === "g") {
        erreur = `Il ne reste que ${dispo} g de « ${it.nom} ».`;
      } else {
        erreur = `Il ne reste que ${dispo} exemplaire${dispo > 1 ? "s" : ""} de « ${it.nom} ».`;
      }
      return { ok: false, article: it.nom, erreur };
    }

    reserves.push({ cle: op.cle, qty: op.quantite });
  }

  // Réservations enregistrées en une fois, une fois le panier entier sécurisé
  await db.batch([
    ...reserves.map((r) =>
      db.prepare(
        "INSERT OR REPLACE INTO reservations (orderId, cle, qty, expireLe, etat, creeLe) VALUES (?1, ?2, ?3, ?4, 'active', ?5)"
      ).bind(orderId, r.cle, r.qty, expireLe, maintenant())
    ),
    ...reserves.map((r) =>
      tracer(db, { cle: r.cle, delta: -r.qty, motif: "reservation", orderId })
    ),
  ]);

  return { ok: true };
}

/**
 * Confirme la vente : le stock réservé sort définitivement.
 * Idempotent — une notification Monetico rejouée ne décrémente pas deux fois.
 */
export async function consommerReservation(db, orderId) {
  exigeBase(db);
  const { results } = await db
    .prepare("SELECT cle, qty FROM reservations WHERE orderId = ?1 AND etat = 'active'")
    .bind(orderId)
    .all();

  if (!results?.length) return 0;

  const t = maintenant();
  await db.batch([
    ...results.map((r) =>
      db.prepare("UPDATE stocks SET reserve = MAX(0, reserve - ?1), majLe = ?2 WHERE cle = ?3")
        .bind(r.qty, t, r.cle)
    ),
    ...results.map((r) =>
      db.prepare("UPDATE reservations SET etat = 'consommee' WHERE orderId = ?1 AND cle = ?2 AND etat = 'active'")
        .bind(orderId, r.cle)
    ),
    ...results.map((r) => tracer(db, { cle: r.cle, delta: 0, motif: "consommation", orderId })),
  ]);
  return results.length;
}

/**
 * Rend le stock d'une commande : paiement refusé, ou annulation par le
 * commerçant. Idempotent lui aussi.
 */
export async function relacherReservation(db, orderId, motif = "relache") {
  exigeBase(db);
  const { results } = await db
    .prepare("SELECT cle, qty FROM reservations WHERE orderId = ?1 AND etat = 'active'")
    .bind(orderId)
    .all();

  if (!results?.length) return 0;
  await relacherPanier(db, orderId, results, motif);
  return results.length;
}

/** Rend une liste de lignes déjà réservées. Usage interne. */
async function relacherPanier(db, orderId, lignes, motif) {
  if (!lignes.length) return;
  const t = maintenant();
  await db.batch([
    ...lignes.map((r) =>
      db.prepare("UPDATE stocks SET dispo = dispo + ?1, reserve = MAX(0, reserve - ?1), majLe = ?2 WHERE cle = ?3")
        .bind(r.qty, t, r.cle)
    ),
    ...lignes.map((r) =>
      db.prepare("UPDATE reservations SET etat = 'relachee' WHERE orderId = ?1 AND cle = ?2 AND etat = 'active'")
        .bind(orderId, r.cle)
    ),
    ...lignes.map((r) => tracer(db, { cle: r.cle, delta: r.qty, motif, orderId })),
  ]);
}

/**
 * Restitue le stock d'une commande annulée, **quel que soit son état**.
 *
 * relacherReservation() ne traite que les réservations encore actives, ce qui
 * couvre le paiement refusé mais pas l'annulation d'une commande déjà payée :
 * sa réservation est alors « consommée ». Sans cette fonction, un
 * remboursement ferait disparaître le stock définitivement.
 *
 * Idempotente : une réservation restituée passe à « relachee » et ne peut
 * plus être créditée une seconde fois.
 *
 * @returns {Promise<number>} lignes restituées
 */
export async function restituerCommande(db, orderId, auteur = "admin") {
  exigeBase(db);

  const { results } = await db
    .prepare("SELECT cle, qty, etat FROM reservations WHERE orderId = ?1 AND etat IN ('active','consommee')")
    .bind(orderId)
    .all();

  if (!results?.length) return 0;

  const t = maintenant();
  const lots = [];
  for (const r of results) {
    // Une réservation active occupe encore `reserve`, une consommée non.
    lots.push(
      r.etat === "active"
        ? db.prepare("UPDATE stocks SET dispo = dispo + ?1, reserve = MAX(0, reserve - ?1), majLe = ?2 WHERE cle = ?3")
            .bind(r.qty, t, r.cle)
        : db.prepare("UPDATE stocks SET dispo = dispo + ?1, majLe = ?2 WHERE cle = ?3")
            .bind(r.qty, t, r.cle),
      db.prepare("UPDATE reservations SET etat = 'relachee' WHERE orderId = ?1 AND cle = ?2")
        .bind(orderId, r.cle),
      tracer(db, { cle: r.cle, delta: r.qty, motif: "annulation", orderId, auteur })
    );
  }
  await db.batch(lots);
  return results.length;
}

/**
 * Stocks disponibles pour un ensemble de clés.
 * @returns {Promise<Record<string, number>>}
 */
export async function lireStocks(db, cles) {
  exigeBase(db);
  if (!cles?.length) return {};
  const marques = cles.map((_, i) => `?${i + 1}`).join(",");
  const { results } = await db
    .prepare(`SELECT cle, dispo FROM stocks WHERE cle IN (${marques})`)
    .bind(...cles)
    .all();
  return Object.fromEntries((results || []).map((r) => [r.cle, r.dispo]));
}

/** Inventaire complet, pour l'écran de gestion. */
export async function listerStocks(db) {
  exigeBase(db);
  await purgerExpirees(db);
  const { results } = await db
    .prepare("SELECT cle, dispo, reserve, libelle, majLe FROM stocks ORDER BY libelle")
    .all();
  // L'unité ne vit pas en base : elle découle du catalogue. Une fleur pesée au
  // gramme et un pod à l'unité se comptent différemment à l'écran.
  return (results || []).map((l) => ({ ...l, unite: uniteStock(l.cle) }));
}

/**
 * Fixe le stock disponible d'une clé.
 *
 * Point d'entrée unique pour l'écran de gestion ET pour une future
 * synchronisation automatisée : passer `auteur` et `motif` permet de
 * distinguer une saisie manuelle d'un import.
 */
export async function ajusterStock(db, cle, nouveauDispo, { auteur = "admin", motif = "ajustement" } = {}) {
  exigeBase(db);
  const n = Math.max(0, Math.trunc(Number(nouveauDispo)));
  if (!Number.isFinite(n)) return { ok: false, erreur: "Quantité invalide" };

  const avant = await db.prepare("SELECT dispo FROM stocks WHERE cle = ?1").bind(cle).first();
  if (!avant) return { ok: false, erreur: "Référence inconnue : " + cle };

  await db.batch([
    db.prepare("UPDATE stocks SET dispo = ?1, majLe = ?2 WHERE cle = ?3").bind(n, maintenant(), cle),
    tracer(db, { cle, delta: n - avant.dispo, motif, auteur }),
  ]);
  return { ok: true, avant: avant.dispo, apres: n };
}

/**
 * Ajustement groupé — le même travail que `ajusterStock()`, mais pour un
 * inventaire entier.
 *
 * Écrit pour un cas précis : la mise en service, où les 121 références sont
 * à leur valeur de semis et doivent recevoir leur quantité réelle. Une
 * requête par ligne, c'est 121 allers-retours et autant d'occasions qu'une
 * coupure laisse l'inventaire à moitié saisi.
 *
 * Trois partis pris, dans l'ordre où ils comptent :
 *
 *  1. **Tout ou rien sur les clés.** Si une seule référence est inconnue, le
 *     lot entier est refusé. Une clé inconnue signifie que la page a été
 *     ouverte avant une modification du catalogue : appliquer les autres
 *     lignes donnerait un inventaire partiel que personne ne saurait
 *     rattraper. Mieux vaut recharger.
 *  2. **Les lignes inchangées ne sont pas écrites.** L'écran renvoie tout ce
 *     qu'il affiche ; sans ce filtre, un enregistrement tracerait 121
 *     mouvements de zéro et noierait le journal.
 *  3. **`dispo` seul est touché.** `reserve` appartient aux réservations en
 *     cours ; l'écraser depuis un inventaire relâcherait des paniers en
 *     cours de paiement.
 *
 * @param {Array<{cle: string, dispo: number}>} ajustements
 * @returns {Promise<{ok: boolean, appliquees?: number, inchangees?: number, erreur?: string, inconnues?: string[]}>}
 */
export async function ajusterStocks(db, ajustements, { auteur = "admin", motif = "inventaire" } = {}) {
  exigeBase(db);

  // Dédoublonnage : si l'appelant envoie deux fois la même clé, la dernière
  // valeur gagne. Silencieux, parce que c'est le comportement attendu d'un
  // formulaire, pas une anomalie à signaler.
  const voulu = new Map();
  for (const a of ajustements || []) {
    const cle = String(a?.cle || "").trim();
    if (!cle) return { ok: false, erreur: "Référence vide dans le lot" };
    const n = Number(a?.dispo);
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, erreur: `Quantité invalide pour ${cle} : entier positif ou nul attendu` };
    }
    if (n > 1000000) return { ok: false, erreur: `Quantité irréaliste pour ${cle}` };
    voulu.set(cle, n);
  }
  if (!voulu.size) return { ok: false, erreur: "Aucun ajustement à appliquer" };
  if (voulu.size > 500) return { ok: false, erreur: "Lot trop volumineux (500 références au maximum)" };

  const cles = [...voulu.keys()];
  const trous = cles.map((_, i) => "?" + (i + 1)).join(",");
  const { results = [] } = await db
    .prepare(`SELECT cle, dispo FROM stocks WHERE cle IN (${trous})`)
    .bind(...cles)
    .all();

  const actuel = new Map(results.map((r) => [r.cle, r.dispo]));
  const inconnues = cles.filter((c) => !actuel.has(c));
  if (inconnues.length) {
    return {
      ok: false,
      inconnues,
      erreur: `${inconnues.length} référence(s) inconnue(s) — la page date d'avant une modification du catalogue, la recharger`,
    };
  }

  const t = maintenant();
  const ops = [];
  let inchangees = 0;
  for (const [cle, n] of voulu) {
    if (actuel.get(cle) === n) { inchangees++; continue; }
    ops.push(db.prepare("UPDATE stocks SET dispo = ?1, majLe = ?2 WHERE cle = ?3").bind(n, t, cle));
    ops.push(tracer(db, { cle, delta: n - actuel.get(cle), motif, auteur }));
  }
  if (!ops.length) return { ok: true, appliquees: 0, inchangees };

  // D1 borne la taille d'un batch : on découpe. Chaque tranche reste
  // atomique, ce qui suffit ici — les clés ont déjà toutes été validées, le
  // seul échec possible est une panne, et une tranche appliquée reste juste.
  const TRANCHE = 100;
  for (let i = 0; i < ops.length; i += TRANCHE) {
    await db.batch(ops.slice(i, i + TRANCHE));
  }
  return { ok: true, appliquees: ops.length / 2, inchangees };
}

// ═══════════════════════════════════════════════════════════════════════════
// Réception de marchandise
// Voir docs/etude-reception-marchandise.md
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Entrée de marchandise — ajoute au stock existant.
 *
 * ⚠ À ne pas confondre avec `ajusterStock()`, qui FIXE une valeur absolue.
 * Une livraison s'ajoute : si deux réceptions arrivent le même jour, la
 * seconde ne doit pas effacer la première. C'est la distinction la plus
 * importante de ce module.
 *
 * L'empreinte du document rend l'opération idempotente : redéposer le même
 * bon de livraison ne double pas le stock. La ligne `receptions` est insérée
 * EN PREMIER et sert de verrou — c'est la clé primaire qui arbitre, pas une
 * lecture préalable qui laisserait une fenêtre de course.
 *
 * @param {Array<{cle: string, quantite: number, libelle?: string}>} entrees
 * @returns {Promise<{ok: boolean, appliquees?: number, dejaTraite?: boolean, traiteLe?: number, erreur?: string}>}
 */
export async function entrerStock(db, entrees, {
  empreinte = null, reference = null, fournisseur = null, auteur = "admin",
} = {}) {
  exigeBase(db);

  const lignes = (entrees || [])
    .map((e) => ({
      cle: String(e.cle || "").trim(),
      quantite: Math.trunc(Number(e.quantite)),
      libelle: e.libelle || "",
    }))
    .filter((e) => e.cle && Number.isFinite(e.quantite) && e.quantite !== 0);

  if (!lignes.length) return { ok: false, erreur: "Aucune ligne à entrer" };

  // Verrou : la première insertion gagne, les suivantes ne changent rien.
  if (empreinte) {
    const pose = await db
      .prepare("INSERT OR IGNORE INTO receptions (empreinte, fournisseur, reference, lignes, auteur, creeLe) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
      .bind(empreinte, fournisseur, reference, lignes.length, auteur, maintenant())
      .run();

    if (!pose.meta.changes) {
      const deja = await db
        .prepare("SELECT creeLe FROM receptions WHERE empreinte = ?1").bind(empreinte).first();
      return { ok: false, dejaTraite: true, traiteLe: deja?.creeLe || null,
               erreur: "Ce document a déjà été réceptionné." };
    }
  }

  const t = maintenant();
  const ops = [];
  for (const l of lignes) {
    // Un produit jamais semé n'a pas de ligne : on la crée à zéro plutôt que
    // de perdre la marchandise. INSERT OR IGNORE ne touche pas l'existant.
    ops.push(
      db.prepare("INSERT OR IGNORE INTO stocks (cle, dispo, reserve, libelle, majLe) VALUES (?1, 0, 0, ?2, ?3)")
        .bind(l.cle, l.libelle || l.cle, t)
    );
    ops.push(
      db.prepare("UPDATE stocks SET dispo = dispo + ?1, majLe = ?2 WHERE cle = ?3")
        .bind(l.quantite, t, l.cle)
    );
    ops.push(tracer(db, { cle: l.cle, delta: l.quantite, motif: "reception",
                          orderId: reference, auteur }));
  }

  await db.batch(ops);
  return { ok: true, appliquees: lignes.length };
}

/**
 * Mémorise l'association « libellé du bon → produit », ou la renforce.
 *
 * `vus` compte les confirmations : un alias vu cinq fois est une certitude,
 * un alias vu une fois reste révisable. Le compteur sert aussi à repérer
 * une association posée par erreur — elle restera à 1.
 */
export async function memoriserAlias(db, associations, { fournisseur = null } = {}) {
  exigeBase(db);
  const liste = (associations || []).filter((a) => a?.libelle && a?.cle);
  if (!liste.length) return { ok: true, memorises: 0 };

  const t = maintenant();
  await db.batch(liste.map((a) =>
    db.prepare(
      `INSERT INTO alias_fournisseur (libelle, cle, brut, fournisseur, vus, majLe)
       VALUES (?1, ?2, ?3, ?4, 1, ?5)
       ON CONFLICT(libelle) DO UPDATE SET
         cle  = excluded.cle,
         brut = excluded.brut,
         vus  = CASE WHEN alias_fournisseur.cle = excluded.cle
                     THEN alias_fournisseur.vus + 1 ELSE 1 END,
         majLe = excluded.majLe`
    ).bind(a.libelle, a.cle, a.brut || a.libelle, fournisseur, t)
  ));
  return { ok: true, memorises: liste.length };
}

/** Alias connus, indexés par libellé normalisé. */
export async function lireAlias(db) {
  exigeBase(db);
  const { results } = await db
    .prepare("SELECT libelle, cle, vus FROM alias_fournisseur").all();
  const map = {};
  for (const r of results || []) map[r.libelle] = { cle: r.cle, vus: r.vus };
  return map;
}

/** Dernières réceptions, pour l'historique de l'écran. */
export async function listerReceptions(db, limite = 20) {
  exigeBase(db);
  const { results } = await db
    .prepare("SELECT empreinte, fournisseur, reference, lignes, auteur, creeLe FROM receptions ORDER BY creeLe DESC LIMIT ?1")
    .bind(Math.min(100, Math.max(1, Number(limite) || 20))).all();
  return results || [];
}
