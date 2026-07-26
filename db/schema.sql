-- ═══════════════════════════════════════════════════════════════════════════
-- maisoncbdvape-stocks — schéma D1
--
-- Appliquer :
--   npx wrangler d1 execute maisoncbdvape-stocks --file=db/schema.sql --remote
--
-- Le stock vit ici et nulle part ailleurs. Le champ "stock" des fiches
-- produits ne sert qu'à semer un produit la première fois : il n'est jamais
-- relu ensuite, et un rebuild ne réécrit aucun stock existant.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS stocks (
  -- "produit-id" pour un produit simple, "produit-id::4g" pour une variante
  cle        TEXT PRIMARY KEY,
  -- Vendable immédiatement. C'est ce que voit le client.
  dispo      INTEGER NOT NULL DEFAULT 0,
  -- Engagé par un paiement en cours, plus vendable mais pas encore vendu.
  -- Permet au commerçant de distinguer « vendu » de « en cours ».
  reserve    INTEGER NOT NULL DEFAULT 0,
  -- Libellé lisible, pour l'écran de gestion (évite une jointure au catalogue)
  libelle    TEXT NOT NULL DEFAULT '',
  majLe      INTEGER NOT NULL DEFAULT 0,

  CHECK (dispo >= 0),
  CHECK (reserve >= 0)
);

CREATE TABLE IF NOT EXISTS reservations (
  orderId   TEXT NOT NULL,
  cle       TEXT NOT NULL,
  qty       INTEGER NOT NULL,
  -- Horodatage ms. Passé cette date sans confirmation, le stock est rendu.
  expireLe  INTEGER NOT NULL,
  -- 'active' | 'consommee' | 'relachee'
  -- Une réservation n'est jamais supprimée : son état garantit l'idempotence
  -- quand Monetico envoie deux fois la même notification.
  etat      TEXT NOT NULL DEFAULT 'active',
  creeLe    INTEGER NOT NULL,

  PRIMARY KEY (orderId, cle)
);

-- Purge des réservations périmées : filtre sur état + date
CREATE INDEX IF NOT EXISTS idx_reservations_purge
  ON reservations (etat, expireLe);

-- Journal des mouvements — indispensable pour comprendre un écart de stock,
-- et point d'entrée naturel pour une future synchronisation automatisée.
CREATE TABLE IF NOT EXISTS mouvements (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  cle       TEXT NOT NULL,
  delta     INTEGER NOT NULL,
  -- 'reservation' | 'consommation' | 'relache' | 'expiration'
  -- | 'ajustement' | 'semis' | 'sync'
  motif     TEXT NOT NULL,
  orderId   TEXT,
  auteur    TEXT NOT NULL DEFAULT 'systeme',
  creeLe    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mouvements_cle ON mouvements (cle, creeLe);
