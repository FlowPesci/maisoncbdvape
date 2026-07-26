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

-- ═══════════════════════════════════════════════════════════════════════════
-- Réception de marchandise — voir docs/etude-reception-marchandise.md
-- ═══════════════════════════════════════════════════════════════════════════

-- Mémoire des libellés fournisseurs.
-- « AMNES. HYDRO IND. 500G » n'est associé à un produit qu'une seule fois :
-- la fois suivante, la ligne est reconnue sans IA et sans doute possible.
-- C'est ce qui fait qu'une deuxième réception du même fournisseur ne demande
-- pratiquement plus rien.
CREATE TABLE IF NOT EXISTS alias_fournisseur (
  -- Libellé du bon, normalisé (minuscules, sans accents ni ponctuation)
  libelle    TEXT PRIMARY KEY,
  -- Clé de stock visée : "produit-id" ou "produit-id::4g"
  cle        TEXT NOT NULL,
  -- Texte d'origine, gardé tel quel pour pouvoir relire l'historique
  brut       TEXT NOT NULL DEFAULT '',
  fournisseur TEXT,
  -- Nombre de fois où l'association a été confirmée : sert à départager
  -- deux alias concurrents et à repérer une association douteuse.
  vus        INTEGER NOT NULL DEFAULT 1,
  majLe      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_alias_cle ON alias_fournisseur (cle);

-- Documents déjà traités. Redéposer le même bon de livraison est l'erreur la
-- plus naturelle qui soit : sans cette table, le stock doublerait en silence.
CREATE TABLE IF NOT EXISTS receptions (
  -- SHA-256 du fichier déposé
  empreinte   TEXT PRIMARY KEY,
  fournisseur TEXT,
  reference   TEXT,
  -- Nombre de lignes réellement appliquées
  lignes      INTEGER NOT NULL DEFAULT 0,
  auteur      TEXT NOT NULL DEFAULT 'admin',
  creeLe      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_receptions_date ON receptions (creeLe);
