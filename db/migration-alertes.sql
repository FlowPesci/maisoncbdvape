-- ═══════════════════════════════════════════════════════════════════════════
-- Migration — alertes de réassort et attentes de retour en stock
--
--   npm run db:migrate:alertes
--
-- ⚠ Rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Alerte de réassort ────────────────────────────────────────────────────
-- Date du dernier e-mail envoyé pour cette référence, ou NULL.
--
-- Cette colonne n'est pas un journal, c'est un interrupteur. Sans elle, une
-- référence restée sous son seuil déclencherait une alerte à CHAQUE commande :
-- au bout de trois jours le commerçant filtrerait ces messages, et l'alerte
-- utile passerait avec les autres. Elle est remise à NULL dès que le stock
-- repasse au-dessus du seuil — c'est le franchissement qui alerte, pas l'état.
ALTER TABLE stocks ADD COLUMN alerteLe INTEGER;

-- ─── Attentes de retour en stock ───────────────────────────────────────────
-- Une rupture est une vente perdue en silence. Ces lignes disent au
-- commerçant ce que ses clients attendent vraiment — donc quoi recommander
-- en priorité, information qu'il n'a par aucun autre moyen.
CREATE TABLE IF NOT EXISTS attentes (
  cle       TEXT NOT NULL,
  email     TEXT NOT NULL,
  -- Horodatage ms de l'inscription
  creeLe    INTEGER NOT NULL,
  -- Horodatage ms de l'envoi de l'avis de retour, ou NULL si en attente
  prevenuLe INTEGER,

  -- Une même personne ne s'inscrit qu'une fois par référence : se réinscrire
  -- ne crée pas de doublon et ne renvoie pas d'e-mail.
  PRIMARY KEY (cle, email)
);

-- Retrouver les inscrits d'une référence qui vient d'être réapprovisionnée.
CREATE INDEX IF NOT EXISTS idx_attentes_cle ON attentes (cle, prevenuLe);

-- ─── Avis clients ──────────────────────────────────────────────────────────
-- ⚠ Aucune ligne de cette table ne doit être écrite autrement que par le
-- dépôt d'un client dont la commande a été retrouvée. Publier un avis
-- inventé est une pratique commerciale trompeuse (art. L121-2 du code de la
-- consommation) ; la mention « achat vérifié » sans vérification l'est aussi.
CREATE TABLE IF NOT EXISTS avis (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  produitId   TEXT NOT NULL,
  -- Commande qui prouve l'achat. C'est ce qui rend « achat vérifié » vrai.
  orderId     TEXT NOT NULL,
  -- Prénom + initiale, tel que saisi. Jamais l'e-mail : il n'est pas public.
  auteur      TEXT NOT NULL,
  note        INTEGER NOT NULL,
  commentaire TEXT NOT NULL DEFAULT '',
  -- 'attente' | 'publie' | 'refuse' — rien n'est visible sans validation
  etat        TEXT NOT NULL DEFAULT 'attente',
  creeLe      INTEGER NOT NULL,
  modereLe   INTEGER,

  -- Un avis par produit et par commande : sans cette contrainte, une même
  -- commande pourrait noter dix fois le même article.
  UNIQUE (orderId, produitId),
  CHECK (note BETWEEN 1 AND 5),
  CHECK (etat IN ('attente', 'publie', 'refuse'))
);

CREATE INDEX IF NOT EXISTS idx_avis_produit ON avis (produitId, etat);
CREATE INDEX IF NOT EXISTS idx_avis_etat    ON avis (etat, creeLe);
