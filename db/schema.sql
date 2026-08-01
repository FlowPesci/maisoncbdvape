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
  -- Date du dernier e-mail de réassort, ou NULL. Interrupteur, pas journal :
  -- remis à NULL dès que le stock repasse au-dessus du seuil, pour que ce
  -- soit le franchissement qui alerte et non l'état. Voir db/migration-alertes.sql
  alerteLe   INTEGER,

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

-- ═══════════════════════════════════════════════════════════════════════════
-- Attentes de retour en stock
-- Une rupture est une vente perdue en silence. Ces lignes disent ce que les
-- clients attendent — donc quoi recommander en priorité.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS attentes (
  cle       TEXT NOT NULL,
  email     TEXT NOT NULL,
  creeLe    INTEGER NOT NULL,
  -- Horodatage de l'avis de retour, ou NULL si la personne attend encore
  prevenuLe INTEGER,
  PRIMARY KEY (cle, email)
);

CREATE INDEX IF NOT EXISTS idx_attentes_cle ON attentes (cle, prevenuLe);

-- ═══════════════════════════════════════════════════════════════════════════
-- Avis clients
-- ⚠ Uniquement des avis déposés par un client dont la commande a été
-- retrouvée, et validés à la main. Voir db/migration-alertes.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS avis (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  produitId   TEXT NOT NULL,
  orderId     TEXT NOT NULL,
  auteur      TEXT NOT NULL,
  note        INTEGER NOT NULL,
  commentaire TEXT NOT NULL DEFAULT '',
  etat        TEXT NOT NULL DEFAULT 'attente',
  creeLe      INTEGER NOT NULL,
  modereLe   INTEGER,
  UNIQUE (orderId, produitId),
  CHECK (note BETWEEN 1 AND 5),
  CHECK (etat IN ('attente', 'publie', 'refuse'))
);

CREATE INDEX IF NOT EXISTS idx_avis_produit ON avis (produitId, etat);
CREATE INDEX IF NOT EXISTS idx_avis_etat    ON avis (etat, creeLe);
