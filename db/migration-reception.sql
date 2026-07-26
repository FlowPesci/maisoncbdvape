-- ═══════════════════════════════════════════════════════════════════════════
-- Migration — réception de marchandise (2026-07-26)
--
-- À jouer sur une base déjà en service. Sans effet si rejouée.
--   npx wrangler d1 execute maisoncbdvape-stocks --file=db/migration-reception.sql --remote
--
-- Le schéma complet (db/schema.sql) contient déjà ces tables : ce fichier
-- n'existe que pour ne pas avoir à rejouer tout le schéma sur une base vivante.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS alias_fournisseur (
  libelle     TEXT PRIMARY KEY,
  cle         TEXT NOT NULL,
  brut        TEXT NOT NULL DEFAULT '',
  fournisseur TEXT,
  vus         INTEGER NOT NULL DEFAULT 1,
  majLe       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_alias_cle ON alias_fournisseur (cle);

CREATE TABLE IF NOT EXISTS receptions (
  empreinte   TEXT PRIMARY KEY,
  fournisseur TEXT,
  reference   TEXT,
  lignes      INTEGER NOT NULL DEFAULT 0,
  auteur      TEXT NOT NULL DEFAULT 'admin',
  creeLe      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_receptions_date ON receptions (creeLe);
