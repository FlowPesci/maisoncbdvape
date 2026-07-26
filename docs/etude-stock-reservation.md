# Étude — Réservation de stock et prévention de la survente

**Date** : 25 juillet 2026
**Problème** : le stock n'est jamais décrémenté. Deux clients peuvent acheter
simultanément les derniers exemplaires d'un produit. Le contrôle actuel compare la
quantité demandée au stock du catalogue, mais ce stock ne bouge jamais.

---

## 1. Ce qui existe aujourd'hui

`scripts/build-catalog-index.js` fige les stocks au moment du build dans
`functions/_shared/catalog-index.js`. Les endpoints vérifient `qty <= lookupStock(...)`.

Ce contrôle empêche de commander 50 unités quand il y en a 10. Il n'empêche pas
**dix clients de commander 10 unités chacun**. Le stock est une constante de build,
pas un compteur.

---

## 2. Pourquoi Workers KV ne peut pas résoudre ça

C'est la première idée qui vient — le projet utilise déjà KV pour les commandes — et
c'est une impasse. La documentation Cloudflare est explicite sur deux points :

**Cohérence éventuelle.** Les écritures se propagent aux nœuds de bordure en une
soixantaine de secondes. Une lecture juste après une écriture peut renvoyer l'ancienne
valeur. Deux clients servis par deux points de présence différents liraient tous les
deux « stock : 1 ».

**Aucune opération atomique.** KV ne propose ni compare-and-swap ni incrément. Un cycle
lire-modifier-écrire n'est pas protégé : deux écritures concurrentes sur la même clé
s'écrasent mutuellement. Cloudflare cite d'ailleurs le panier et le compteur exact comme
contre-exemples d'usage de KV.

Une réservation en KV donnerait l'illusion de fonctionner en développement, puis
survendrait en production dès que deux commandes se croisent. **Écarté.**

---

## 3. Les deux options viables

### Option A — D1 *(recommandée)*

D1 est la base SQL serverless de Cloudflare, disponible sur le plan gratuit. La
réservation tient en une requête, atomique par construction :

```sql
UPDATE stocks
   SET dispo = dispo - ?1
 WHERE cle = ?2
   AND dispo >= ?1;
```

Si `rowsAffected` vaut 0, le stock était insuffisant : la commande est refusée. Aucune
lecture préalable, donc aucune fenêtre de course. SQLite garantit l'atomicité de
l'instruction.

**Avantages** : modèle mental simple, données inspectables en SQL depuis le tableau de
bord Cloudflare, une seule table pour tout le catalogue, restauration facile.

**Limite** : les écritures passent par un primaire unique. Sans objet ici — on parle de
quelques dizaines de commandes par jour.

### Option B — Durable Objects

Un Durable Object par produit sérialise tous les accès : exécution mono-thread, cohérence
forte, lectures reflétant toujours la dernière écriture. C'est la réponse canonique de
Cloudflare aux compteurs exacts.

**Bonne nouvelle** : les Durable Objects sont disponibles **sur le plan gratuit**
(backend SQLite uniquement), avec 100 000 requêtes et 13 000 GB-s par jour. Très
largement au-dessus des besoins de la boutique.

**Inconvénient** : plus de code et un modèle mental moins familier — un objet par
produit, une classe à déclarer, des migrations à gérer. Surdimensionné pour le volume
attendu.

### Verdict

**D1.** Le gain de robustesse est identique à l'échelle de cette boutique, pour une
complexité nettement moindre. Les Durable Objects deviendraient pertinents si le stock
devait être partagé entre plusieurs boutiques ou soumis à des pics de concurrence forts.

---

## 4. La vraie difficulté : qui possède le stock ?

Le choix technique est le plus facile. Le point structurant est ailleurs.

Aujourd'hui le stock vit **dans git**, dans `src/data-source/produits/*.json`, édité via
Decap CMS. Il est figé à chaque build. Si les décréments se font en base, on obtient deux
sources de vérité qui divergent immédiatement : le fichier dit 10, la base dit 3, et le
prochain déploiement réaffiche 10.

C'est exactement la classe de bug qu'on a éliminée toute la journée sur les frais de port
et les créneaux. **Il faut une seule source.**

### Modèle retenu

| Donnée | Source de vérité | Édition |
| --- | --- | --- |
| Catalogue (nom, prix, photos, variantes) | git / Decap CMS | `/admin/` |
| **Stock disponible** | **D1** | back-office commandes |
| Stock initial d'un nouveau produit | git, **semé une seule fois** en D1 | `/admin/` |

Conséquences concrètes :

- Le champ `stock` des fiches produits devient **« stock initial »**, utilisé uniquement à
  la création. Son libellé dans Decap doit le dire, sinon le commerçant croira le modifier.
- Le stock courant se gère dans une nouvelle page du back-office, à côté des commandes.
- Le build ne réécrit plus jamais un stock existant : il ne fait qu'insérer les produits
  encore absents de la table.

---

## 5. Cycle de vie d'une réservation

Le moment du décrément dépend du mode de paiement, et c'est là que se cachent les pièges.

```
Réservation en boutique (sans paiement)
   commande créée → décrément immédiat → stock engagé

Paiement Monetico
   commande créée  → réservation (dispo −N, reserve +N)
        │
        ├─ notification « paiement accepté » → réservation consommée
        │
        ├─ notification « paiement refusé »  → réservation relâchée
        │
        └─ aucune notification sous 30 min   → réservation expirée, stock rendu
```

**Le troisième cas est le plus important.** Un client qui abandonne sur la page Monetico
ne génère aucune notification. Sans expiration, son panier immobiliserait le stock
indéfiniment. Une réservation porte donc une date limite, et toute lecture purge au
passage les réservations périmées — pas besoin de tâche planifiée.

**Annulation par le commerçant** : passer une commande en « Annulée » depuis le
back-office doit rendre le stock. C'est le chemin le plus souvent oublié.

**Idempotence** : la notification Monetico peut arriver deux fois. La consommation d'une
réservation doit être marquée, sinon le stock est décrémenté deux fois pour une commande.

---

## 6. Schéma proposé

```sql
CREATE TABLE stocks (
  cle    TEXT PRIMARY KEY,   -- "produit-id" ou "produit-id::4g"
  dispo  INTEGER NOT NULL,   -- vendable immédiatement
  reserve INTEGER NOT NULL DEFAULT 0  -- engagé par un paiement en cours
);

CREATE TABLE reservations (
  orderId   TEXT NOT NULL,
  cle       TEXT NOT NULL,
  qty       INTEGER NOT NULL,
  expireLe  INTEGER NOT NULL,       -- horodatage
  etat      TEXT NOT NULL,          -- 'active' | 'consommee' | 'relachee'
  PRIMARY KEY (orderId, cle)
);
```

`dispo` est ce que voit le client. `reserve` sert au commerçant à distinguer « vendu » de
« en cours de paiement » — utile pour comprendre un écart de stock physique.

---

## 7. Charge estimée

| Lot | Charge |
| --- | --- |
| Base D1, schéma, semis depuis le catalogue | 0,5 j |
| Module de réservation (réserver, consommer, relâcher, purger) | 0,75 j |
| Branchement des deux endpoints + notification Monetico | 0,5 j |
| Restitution du stock à l'annulation d'une commande | 0,25 j |
| Écran de gestion des stocks dans le back-office | 0,75 j |
| Affichage du stock réel sur les fiches produits | 0,25 j |
| Recette, dont test de concurrence | 0,5 j |
| **Total** | **~3,5 j** |

---

## 8. Ce que ça change pour le commerçant

Le stock cesse d'être un chiffre décoratif et devient un engagement. Deux conséquences
qu'il faut accepter avant de se lancer :

- **Un stock à zéro rend le produit incommandable.** Si les stocks saisis ne reflètent pas
  la réalité du magasin, des ventes seront refusées à tort. Le passage en production
  suppose un inventaire à jour.
- **Le stock du site et celui du magasin physique divergeront.** Une vente au comptoir ne
  décrémente rien. Soit le commerçant ajuste régulièrement, soit il réserve une part de
  son stock à la vente en ligne.

C'est le vrai coût de la fonctionnalité, et il est organisationnel, pas technique.

---

## Sources

- Cloudflare — *How KV works* (cohérence éventuelle, écritures concurrentes) :
  <https://developers.cloudflare.com/kv/concepts/how-kv-works/>
- Cloudflare — *Choosing a data or storage product* :
  <https://developers.cloudflare.com/workers/platform/storage-options/>
- Cloudflare — *Durable Objects pricing* (disponibilité sur le plan gratuit) :
  <https://developers.cloudflare.com/durable-objects/platform/pricing/>

---

# Mise en service — procédure

**Statut au 25/07/2026** : tout le code est écrit et testé. Il reste trois actions
manuelles sur le compte Cloudflare, que seul le propriétaire peut faire.

## Étape 1 — Créer la base

```powershell
cd C:\dev\maisoncbdvape-eleventy
npx wrangler d1 create maisoncbdvape-stocks
```

Wrangler affiche un bloc contenant `database_id`. Reporter cet identifiant dans
`wrangler.toml`, à la place de `À_REMPLACER` :

```toml
[[d1_databases]]
binding = "STOCKS_DB"
database_name = "maisoncbdvape-stocks"
database_id = "le-vrai-identifiant"
```

## Étape 2 — Créer les tables et semer les stocks

```powershell
npm run db:schema     # crée stocks, reservations, mouvements
npm run db:seed       # insère les 159 références, sans écraser l'existant
```

`db:seed` est rejouable sans risque : il n'insère que les références absentes.
À relancer après chaque ajout de produit au catalogue.

## Étape 3 — Déployer

**Aucune manipulation dans le tableau de bord.** Ce projet Pages lit sa configuration
depuis `wrangler.toml` — l'interface affiche « Bindings for this project are being
managed through wrangler.toml » et y est en lecture seule. Le binding `STOCKS_DB` est
déjà dans le fichier : il suffit de pousser.

```powershell
git add -A
git commit -m "feat: reservation de stock en D1"
git push
```

Cloudflare redéploie automatiquement et le binding devient actif.

**Vérification que le binding est bien pris** : après le déploiement, ouvrir
`/admin/stocks/`. Si l'inventaire s'affiche, `env.STOCKS_DB` est branché. Si un message
« Base de stocks non configurée » apparaît, c'est que le déploiement n'a pas repris le
fichier — vérifier que `wrangler.toml` est bien poussé.

## Étape 4 — Saisir les stocks réels

`/admin/stocks/` — recherche, filtre sur les ruptures, édition en place.
Les 159 références partent à 10, valeur héritée du catalogue. **Tant que cet
inventaire n'est pas fait, le site vend sur des chiffres faux.**

## Vérification

```powershell
npx wrangler d1 execute maisoncbdvape-stocks --remote --command "SELECT COUNT(*) FROM stocks"
npx wrangler d1 execute maisoncbdvape-stocks --remote --command "SELECT * FROM mouvements ORDER BY id DESC LIMIT 10"
```

Puis une commande de bout en bout : le stock doit baisser dans `/admin/stocks/`,
et le journal `mouvements` porter une ligne `reservation` puis `consommation`.

---

## Ce qui est couvert

| Chemin | Traitement | Idempotent |
| --- | --- | --- |
| Commande créée (paiement) | réservation, expire à 30 min | — |
| Commande créée (retrait) | réservation puis consommation immédiate | — |
| Paiement accepté | consommation | oui |
| Paiement refusé | relâche | oui |
| Formulaire Monetico en échec | relâche | oui |
| Client parti sans payer | expiration à la lecture suivante | oui |
| Annulation d'une commande non payée | restitution | oui |
| **Annulation d'une commande payée** | **restitution** | oui |
| Panier partiellement disponible | tout ou rien, rien n'est réservé | — |
| Binding D1 absent | commande refusée, jamais de vente à l'aveugle | — |

## Vers une gestion automatisée

Le socle est prêt pour une synchronisation externe (caisse, ERP) :

- `POST /api/stocks` avec `motif: "sync"` fixe un stock et trace le mouvement
  comme un import, distinct d'une saisie manuelle.
- La table `mouvements` conserve l'historique complet avec auteur et motif :
  un écart entre le stock physique et le stock du site devient traçable.
- `ajusterStock()` est le point d'entrée unique — un connecteur n'aura pas à
  réimplémenter la logique.

Reste à définir, le moment venu : le sens de la synchronisation (la caisse
fait-elle autorité ?), sa fréquence, et le traitement des ventes au comptoir
survenues pendant qu'une réservation en ligne est active.
