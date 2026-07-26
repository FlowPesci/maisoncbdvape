-- ═══════════════════════════════════════════════════════════════════════════
-- Migration — passage des fleurs CBD au stock en vrac (grammes)
--
-- Contexte : les 19 fleurs CBD sont pesées à la commande depuis un stock en
-- vrac. Leur stock ne se tient donc pas par sachet (2g, 4g, 8g) mais en
-- grammes au niveau du produit. Un sachet de 4 g retire 4 g du vrac.
--
-- Cette migration supprime les 57 lignes de variantes devenues fausses.
-- Les lignes produit sont créées par db/seed.sql, à exécuter ENSUITE.
--
--   npx wrangler d1 execute maisoncbdvape-stocks --file=db/migration-vrac.sql --remote
--   npx wrangler d1 execute maisoncbdvape-stocks --file=db/seed.sql --remote
--
-- ⚠ À n'exécuter qu'une fois. Sans effet si rejouée.
-- ═══════════════════════════════════════════════════════════════════════════

-- Trace de ce qui est retiré, pour pouvoir reconstituer l'historique
INSERT INTO mouvements (cle, delta, motif, auteur, creeLe)
SELECT cle, -dispo, 'migration-vrac', 'systeme', unixepoch() * 1000
  FROM stocks
 WHERE cle LIKE '%::%g';

-- Les réservations actives sur ces clés n'ont plus de sens
UPDATE reservations SET etat = 'relachee'
 WHERE etat = 'active' AND cle LIKE '%::%g';

-- Suppression des stocks par sachet
DELETE FROM stocks WHERE cle LIKE '%::%g';
