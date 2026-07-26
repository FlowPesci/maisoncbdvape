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

/** Clé de stock d'un article du panier. */
export function cleStock(id, varianteLabel) {
  return varianteLabel ? `${id}::${varianteLabel}` : String(id);
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
    const cle = cleStock(it.id, it.varianteLabel);
    const qty = Number(it.qty);

    // Le cœur du dispositif : atomique, sans lecture préalable.
    const res = await db
      .prepare("UPDATE stocks SET dispo = dispo - ?1, reserve = reserve + ?1, majLe = ?2 WHERE cle = ?3 AND dispo >= ?1")
      .bind(qty, maintenant(), cle)
      .run();

    if (!res.meta.changes) {
      // Échec : on rend ce qui vient d'être pris pour cette commande
      await relacherPanier(db, orderId, reserves, "relache");

      const ligne = await db.prepare("SELECT dispo FROM stocks WHERE cle = ?1").bind(cle).first();
      const dispo = ligne?.dispo ?? 0;
      return {
        ok: false,
        article: it.nom,
        erreur: dispo <= 0
          ? `« ${it.nom} » vient d'être épuisé.`
          : `Il ne reste que ${dispo} exemplaire${dispo > 1 ? "s" : ""} de « ${it.nom} ».`,
      };
    }

    reserves.push({ cle, qty });
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
  return results || [];
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
