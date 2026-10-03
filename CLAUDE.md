# MaisonCBDVape — mémoire du projet

Boutique CBD / vape / puffs à Gex (01170). Eleventy 3 (ESM) + Tailwind, hébergé
sur Cloudflare Pages, logique serveur en Pages Functions.

Ce fichier existe parce qu'un assistant qui reprend ce dépôt peut lire le code
mais ne peut pas deviner **pourquoi** il est écrit ainsi. Tout ce qui suit a été
payé par un bug réel.

---

## Commandes

```bash
npm run build          # clean + css + catalog + 5 contrôles + eleventy + CSP
npm start              # développement, port 8080
npm run dev            # avec les bindings Cloudflare (KV, R2, D1)
```

Le déploiement se fait par **`git push`** : Cloudflare Pages reconstruit sur
chaque commit de `main`, avec `npm run build`. Il n'y a pas d'autre geste.

⚠ **Le dépôt a deux auteurs : vous, et Decap CMS.** Chaque enregistrement de
fiche produit depuis `/admin/contenu/` crée un commit directement sur `main`,
sans passer par votre machine. Un `git push` refusé en `[rejected] (fetch
first)` ne signale donc pas une erreur : c'est le commerçant qui a travaillé
entre-temps. **`git pull --rebase` puis `git push`** — le rebase évite un
commit de fusion, et les deux sources touchent des fichiers différents
(`src/data-source/produits/*.json` pour le CMS).

**L'ordre compte** : `git add -A`, `git commit`, PUIS `git pull --rebase`,
PUIS `git push`. Le rebase exige un arbre propre — le faire avant le commit
échoue en « cannot pull with rebase: You have unstaged changes ».

⚠ **Le seul terrain de conflit réel, ce sont les fiches produits.** Les deux
auteurs ne se marchent dessus que là, et donc seulement quand VOUS touchez à
`src/data-source/produits/*.json` — c'est-à-dire lors d'une migration en lot
(ajout d'un champ, changement de forme). Le 2026-09-27 et le 2026-09-28, deux
migrations ont produit deux conflits, dont un `modify/delete` : le commerçant
avait supprimé une fiche que la migration modifiait.

Règles de résolution, dans l'ordre :

1. **Sur une fiche produit, la version du commerçant gagne toujours.** C'est
   lui qui connaît son magasin : ses prix, ses stocks, ses suppressions. On
   garde son côté, on y réinjecte le champ que la migration ajoutait.
2. **`modify/delete` → la suppression gagne** (`git rm <fiche>`). Il ne vend
   plus ce produit ; la modification n'a plus d'objet.
3. **Une migration en lot se fait vite** : `git pull --rebase` juste avant, et
   `git push` juste après. La fenêtre de conflit est le temps qui s'écoule
   entre les deux.

⚠ **Ne jamais lancer une commande Git qui écrit depuis un environnement qui
voit le dépôt à travers un montage** (bac à sable Linux, WSL, conteneur). Le
2026-09-28, un `git fetch` lancé ainsi a écrit dans `.git/objects/` avec des
droits que la session Windows ne pouvait plus reprendre : `git add` refusait
tout avec « unable to write file … Permission denied ». Lecture seule de ce
côté-là — `git status`, `git log`, `git show`.

Conséquence moins évidente : **le site peut être en cours de reconstruction à
tout moment**, déclenché par une modification de fiche. Pendant ces quelques
secondes le Worker est injoignable, et un envoi d'image depuis le back-office
échoue avec un « Failed to fetch » du navigateur — sans rapport avec l'image.
`admin/contenu/media-library.js` l'explique désormais en clair plutôt que de
relayer le message brut.

⚠ Une construction Eleventy complète génère plus de 160 pages et prend du
temps. Dans un environnement à durée limitée, ignorer `src/produits/**` et
`src/categories/**` pour vérifier le reste.

### Base de données (D1)

```bash
npm run db:etat                # état des stocks, à lancer avant tout diagnostic
npm run db:seed                # ajoute les nouvelles références (INSERT OR IGNORE)
npm run db:migrate:alertes     # colonne alerteLe + tables attentes et avis
```

⚠ **La première commande wrangler d'une session échoue systématiquement** avec
`Authentication error [code: 10000]`, puis les suivantes passent. Le jeton OAuth
se renouvelle après le premier refus. Relancer, simplement.

⚠ **Un wrangler trop ancien fait échouer D1 en accusant le COMPTE.** Le
2026-10-03, `d1 execute` refusait toute requête :

```
The given account is not valid or is not authorized to access this service
[code: 7403]
```

Le compte était le bon (`0f42b1d5…`, celui du projet Pages, vérifié dans l'URL
du tableau de bord), le jeton portait `d1 (write)`, et **`d1 list` voyait la
base** avec le bon UUID et ses 155 Ko. Seul `d1 execute` tombait — les deux ne
tapent pas le même endpoint. La même commande est passée du premier coup avec
`npx wrangler@latest` : **4.94.0 refusée, 4.147.0 acceptée.**

⚠ **Ce n'est PAS le refus transitoire 10000 documenté ci-dessous.** Relancer ne
sert à rien, et le message envoie chercher du côté de l'authentification. J'ai
suivi cette piste pendant deux tours — compte, jeton, portée des droits — avant
de penser au client. Le réflexe utile : **si `d1 list` passe et que
`d1 execute` échoue, le compte est hors de cause.**

La leçon est celle de la clé Resend, déplacée d'un cran : un message d'erreur
nomme ce que le serveur a constaté, pas ce qui l'a provoqué. Et ici le serveur
voyait bien un appel mal formé par un client périmé.

⚠ **Ne PAS monter wrangler dans `package.json` pour autant.** C'est ce que
j'ai fait dans la foulée, et **le déploiement suivant est tombé** — voir
« `npm ci` refuse de réconcilier » plus bas. Deux raisons de s'en abstenir :

1. **La construction ne se sert pas de wrangler.** `npm run build` enchaîne
   clean, css, catalog, les contrôles, eleventy et la CSP. Wrangler ne sert
   qu'à `npm run dev` et aux commandes `db:` — toutes locales.
2. **wrangler 4.147 exige Node ≥ 22**, et l'image de construction Cloudflare
   tourne en **Node 20.20.0** (lui-même en fin de vie, le journal le dit).
   Même avec un lock régénéré, on installerait un paquet hors de son moteur
   pour un gain nul au build.

**Le besoin était purement local.** Les huit scripts `db:` appellent donc
**`npx -y wrangler@4.147.0`**, et non le wrangler du projet :

| | version | pourquoi |
|---|---|---|
| `npm run dev` (`wrangler pages dev`) | 4.94, celle du dépôt | pinée dans le lock, installée par `npm ci` |
| `npm run db:*` | **4.147.0, via npx** | la seule qui parle encore à l'API D1 |

⚠ **Version figée, jamais `@latest`.** `@latest` ferait dépendre une commande
qui écrit dans la base de ce que npm publiera demain. Deux versions cohabitent,
c'est assumé et c'est écrit ici pour que personne ne « simplifie » en les
réunissant sans s'être assuré que le build survit.

**Le vrai correctif, le jour où on le prendra** : monter wrangler dans le
dépôt, régénérer le lock (`npm install` **et commiter le lock**), et passer
l'image Cloudflare en Node 22 (variable `NODE_VERSION`). C'est un geste
délibéré, pas un effet de bord d'un dépannage.

⚠ **Et si on monte wrangler un jour, c'est `npm install` sur la machine
Windows**, jamais depuis le bac à sable : `node_modules` vit dans le dépôt
monté, et une écriture depuis l'autre côté y poserait les mêmes droits
impossibles à reprendre que le `git fetch` du 2026-09-28.

### ⚠ `npm ci` refuse de réconcilier — et une ligne éteint la boutique

```bash
npm run verify:lock    # tourne en PREMIER dans npm run build
```

Le 2026-10-03, j'ai changé une version dans `package.json` sans régénérer
`package-lock.json`. En local, rien ne l'a signalé — `npm install` l'aurait
corrigé, je ne l'ai pas lancé. Le déploiement a échoué :

```
npm error `npm ci` can only install packages when your package.json and
package-lock.json are in sync.
npm error Invalid: lock file's wrangler@4.94.0 does not satisfy wrangler@4.147.0
```

**Cloudflare installe avec `npm clean-install`**, et `npm ci` ne réconcilie
rien par conception — c'est ce qui garantit des constructions reproductibles.

⚠ **Soixante lignes d'erreur pour une seule cause.** esbuild, miniflare,
workerd, les paquets de plateforme de sharp : tout cela n'est que l'arbre de
dépendances de la version demandée comparé à celui du lock. **Lire la première
ligne `Invalid:` suffit**, les autres en découlent. Chercher un défaut par
ligne ferait perdre une heure.

⚠ **Ce n'est pas mon commit qui était bloqué, c'est `main`.** Tant que les deux
fichiers divergent, **toute** construction échoue — y compris celle déclenchée
par le commerçant quand il enregistre une fiche depuis `/admin/contenu/`. Il
n'aurait vu qu'un déploiement rouge sans rapport avec son geste. C'est le
scénario que `verify:redaction` a déjà coûté deux jours.

`verify:lock` compare donc les deux fichiers et **bloque la construction**.
Il respecte la règle du projet — il ne se déclenche que sur ce que le CODE peut
casser : le commerçant ne touche jamais à `package.json`.

⚠ Il ne gère volontairement que les formes employées ici (`^`, `~`, exact) et
**se tait** sur tout le reste (`*`, `>=`, `git+…`). Un contrôle qui invente une
règle bloque à tort, et un contrôle qui bloque à tort finit désactivé — même
prudence que les widgets inconnus de `verify:cms`.

**La réparation est toujours la même** : `npm install`, puis **commiter
`package-lock.json`**. Modifier `package.json` sans le lock n'est jamais
correct dans ce dépôt.

⚠ **Une seule instruction par `--command`.** Le 2026-09-19, trois instructions
séparées par `;` dans un même `--command` n'ont produit aucun effet — et
aucune erreur : la vérification qui a suivi montrait la base inchangée.
Wrangler annonce « Executed 1 command » quoi qu'il arrive, donc ce compteur ne
prouve rien. Découper, et **vérifier par un SELECT après coup** plutôt que se
fier au compte-rendu.

⚠ **Les réservations périmées ne se purgent qu'au fil de l'eau**, à chaque
nouvelle réservation (`purgerExpirees`, `_shared/stock.js`) — il n'y a pas de
tâche planifiée. Sur une boutique sans trafic, une réservation abandonnée
reste donc `active` indéfiniment et bloque son unité, bien après son
`expireLe`. Constaté après la recette Monetico. Pour la libérer, passer une
commande quelconque : c'est le code réel qui s'en charge et qui trace le
mouvement. À défaut, reproduire **les trois** gestes de `purgerExpirees` —
`dispo + qty`, `etat = 'relachee'`, **et l'insertion dans `mouvements`**. Un
stock qui bouge sans trace est exactement ce que ce journal existe pour
empêcher.

⚠ **Avant de saisir les stocks réels, vérifier qu'aucune réservation de test
ne traîne** : `SELECT * FROM reservations WHERE etat='active'`. Sinon on
saisit des quantités justes sur des lignes qui en ont une de bloquée.

### ⚠ Renommer une variante ABANDONNE sa ligne de stock

```bash
npm run db:comparer    # clés de la base ↔ libellés réellement vendus
```

Le 2026-10-02, le commerçant n'a pas pu passer une commande de test :
« Pod Al Fakher 50K · Summer Dream (Fruits d'été) » annoncé **épuisé** pendant
que `/admin/stocks/` en affichait **20**. Les deux écrans disaient vrai, et ils
ne parlaient pas du même objet :

```
fiche + catalogue  →  pod-al-fakher-50k::Summer Dream (Fruits d’été)
base D1            →  pod-al-fakher-50k::Summer Dream
```

Il avait ajouté la glose française **après** le semis de la base. **La clé de
stock EST le libellé** (`id::label`) : la renommer dans l'éditeur de contenu
crée une référence sans ligne, et laisse l'ancienne ligne — avec tout le stock
réel — orpheline.

⚠ **Le message mentait, et c'est la moitié du défaut.** `reserverPanier()` fait
`UPDATE stocks … WHERE cle = ?` : zéro ligne touchée. Le `SELECT dispo` qui
suivait ne ramenait rien, et `ligne?.dispo ?? 0` écrasait **ligne absente** sur
**dispo = 0**. Les deux ressortaient en « vient d'être épuisé ».

Ce sont deux pannes différentes : un produit épuisé est une situation normale
de commerce, une référence sans ligne de stock est un défaut de configuration
que personne ne peut deviner depuis la boutique. Elles ne se corrigent pas au
même endroit, elles ne doivent donc pas se dire pareil. `stock.js` les sépare
désormais et **journalise la clé absente** côté serveur.

⚠ **`npm run db:seed` ne répare pas ça.** Il est en `INSERT OR IGNORE` : il
crée la nouvelle clé **à la valeur de semis** et laisse l'ancienne derrière. On
obtient deux lignes, dont une morte, et un stock faux sur celle qui sert. Il
faut **renommer** :

```bash
npx wrangler d1 execute maisoncbdvape-stocks --remote \
  --command "UPDATE stocks SET cle = '<nouvelle>' WHERE cle = '<ancienne>'"
```

`npm run db:comparer` écrit ces commandes tout seul. Il ne modifie rien : un
renommage déplace des quantités réelles, c'est au commerçant de valider les
appariements. Et **une seule instruction par `--command`** — voir plus haut.

⚠ **La ligne de `mouvements` garde l'ancienne clé**, volontairement. Une trace
réécrite n'est plus une trace.

### ⚠ Et ce script a failli faire pire que le défaut qu'il diagnostiquait

La première version de `db:comparer` a proposé, le 2026-10-02, **46 renommages
dont 41 auraient détruit des stocks justes**. Elle suggérait de renommer
`amnesia-hydro-indoor-cbd` — 250 g de vrac, la **bonne** ligne — en
`amnesia-hydro-indoor-cbd::4g`, puis `::8g`, puis `::12g`. La première commande
serait passée, les deux autres n'auraient rien trouvé, et la fiche serait
devenue invendable avec son stock réel sur une clé que plus personne
n'interroge. Aucune n'a été lancée.

**Deux fautes, et la seconde est la plus instructive.**

1. Un bug bête : `"4g".startsWith("")` est vrai. Une clé orpheline sans `::`
   s'appariait donc à **toutes** les variantes de son produit.

2. ⚠ **Le script reconstruisait `id::label` lui-même.** C'est la faute de
   fond : **une fleur au gramme n'a pas de ligne par conditionnement**. Son
   stock est un vrac en grammes porté par la clé du PRODUIT, et un sachet de
   4 g en retire 4 (`facteur`). La règle vit dans `resoudreStock()` /
   `CLES_STOCK` — l'écrire une deuxième fois dans un script de diagnostic, c'est
   exactement ce que `prix-fiche.mjs` existe pour empêcher côté tarifs. Le
   script lit désormais `CLES_STOCK`, la table que le serveur lit.

**La leçon** : un outil de diagnostic qui redéduit la règle au lieu de la lire
ne constate pas un écart, il en invente un. Et comme il écrit du SQL, son
erreur est exécutable.

Trois garde-fous ajoutés à l'appariement, tous testés : les deux clés doivent
porter un libellé non vide ; une ligne orpheline ne peut être proposée qu'une
fois ; et l'appariement doit être **unique dans les deux sens** — « Fraise »
pouvant aller vers « Fraise Glacée » comme vers « Fraise Kiwi », on ne propose
rien plutôt que de deviner.

### ⚠ Et le cas réel n'était PAS un renommage de variante

Une fois le script corrigé, il n'a proposé **aucun** renommage — et c'était
juste. Le vrai écart était ailleurs : **164 lignes en base, 181 références
vendues, 56 sans ligne**.

Les quantités que le commerçant voyait dans `/admin/stocks/` sont portées par
**`al-fakher-crown-bar-30k-20mg`**, une fiche **supprimée du dépôt**. La fiche
vendue s'appelle `pod-al-fakher-50k` et n'a aucune ligne. Il n'a pas renommé
une saveur : il a supprimé un produit et en a créé un autre.

⚠ **Et il ne faut surtout PAS transférer ces quantités.** « Crown Bar 30K » et
« Pod Al Fakher 50K » sont deux appareils différents — 30 000 bouffées contre
50 000. Ils partagent 33 libellés de saveur parce qu'**un fabricant décline la
même gamme d'arômes sur tous ses appareils**. Un fort recoupement de libellés
ne prouve donc rien.

Le script détecte ce motif et le **signale sans écrire une seule commande**,
contrairement au renommage de variante. C'est la conséquence directe de
l'incident ci-dessus : une heuristique qui produit du SQL exécutable est une
heuristique qui sera exécutée. Seul le commerçant sait si deux identifiants
désignent le même objet sur son étagère.

**La bonne voie ici est `db:seed` puis la saisie des stocks réels** — qui reste
de toute façon à faire sur 163 références.

⚠ **Les listes ne sont plus tronquées à 20 lignes.** La première version
coupait, et le 2026-10-02 la clé du diagnostic était précisément dans les
« +19 » masqués : les lignes `al-fakher-crown-bar-30k-20mg::…` qui nommaient
l'ancien identifiant. Un outil qui cache une partie de ce qu'il a trouvé fait
chercher ailleurs.

⚠ **Et `seed-stocks.js` fabriquait lui-même des clés introuvables.** Il lisait
`v.label` **brut**, sans le `trim()` qu'applique `variantesVendables()` avant
d'écrire le catalogue. Les trois libellés à espace finale auraient donc été
semés **avec** l'espace : une ligne de stock que `reserverPanier()` n'irait
jamais chercher, et une saveur silencieusement invendable. Corrigé le
2026-10-03, avant le premier semis réel.

Le reste du script est juste, et il mérite d'être lu avant d'y toucher : une
fiche au gramme reçoit **une seule** ligne, au niveau du produit, en grammes de
vrac — exactement la règle que ma première version de `db:comparer` avait
oubliée.

⚠ **Huit libellés portaient déjà ce risque** au 2026-10-02 : cinq gloses entre
parenthèses sur `pod-al-fakher-50k`, et trois espaces en fin de libellé
(`"Peach Ice "`, `"Pastèque Glacée "`, `"Pastèque Mangue Pêche "`).
`variantesVendables()` fait un `trim()` à l'affichage et au catalogue — donc
une fiche enregistrée avec une espace finale produit une clé **sans** l'espace,
qui ne correspond plus à la ligne semée **avec**. Lancer `db:comparer` après
toute retouche de libellés.

### Médias

```bash
npm run medias:rapatrier:test   # liste les images encore hébergées chez un tiers
npm run medias:rapatrier        # les télécharge, les envoie dans R2, réécrit les fiches
```

Les visuels vivent dans R2 sous le préfixe `produits/`, servis par
`functions/media/[[key]].js`. Le **filigrane** (`maisoncbdvape.fr`, discret,
en bas à droite) est cuit dans le fichier à l'envoi, côté navigateur, dans
`admin/contenu/media-library.js` — une surimpression CSS ne protégerait rien,
le fichier stocké resterait intact. Il porte l'adresse et non un `©` : les
visuels viennent de l'ancien site vitrine et, pour partie, de fiches
fournisseurs. **Les images rapatriées d'un grossiste ne sont pas
filigranées**, et ne doivent pas l'être.

**Le rattrapage sur le stock existant est fait** (2026-09-04) :
`scripts/filigraner-medias.mjs` a filigrané les 129 images qui existaient
avant que `filigraner()` existe, en reproduisant sa formule avec sharp côté
Node (police embarquée en SVG, `feDropShadow` pour l'ombre — voir le script
pour le détail des équivalences canvas → SVG). Les 12 fiches grossiste ont
été exclues (liste `SLUGS_GROSSISTE`, dans le script). Chaque original est
sauvegardé sous `produits-avant-filigrane/<même nom>` avant écrasement ; le
script refuse de retraiter une clé déjà sauvegardée — **il n'est pas conçu
pour rejouer un lot déjà fait**, seulement pour combler un retard une fois.

⚠ **Écraser un objet R2 à la même clé ne suffit pas à le mettre à jour pour
les visiteurs.** `functions/media/[[key]].js` sert `Cache-Control: public,
max-age=31536000, immutable` — jusqu'ici sans conséquence, aucun envoi ne
réutilisait une clé existante. Ce script a été le premier à le faire, et le
cache Cloudflare en périphérie ne l'a pas vu passer : une image déjà en
cache est restée sans filigrane pendant des heures après l'écrasement,
constaté en comparant la copie servie en ligne (ancienne, `cf-cache-status:
HIT`) à la copie réelle dans R2 (filigranée, vérifiée via `wrangler r2
object get`). Une purge de cache (Cloudflare → Caching → Purge Cache) a été
nécessaire après coup. À refaire pour toute clé existante réécrite en place
— voir aussi `verify:cache`, qui attrape le même piège côté `/assets/js` et
`/assets/css`.

### Tests et contrôles

```bash
npm run verify:css        # classes utilisées sans règle CSS, tailles d'icônes
npm run verify:cms        # config Decap + forme des fiches en regard des widgets
npm run verify:api        # appels à des méthodes window.MCV_* inexistantes
npm run verify:redaction  # allégations interdites, champs décoratifs
npm run verify:puffs      # dispositifs à réservoir fixe (loi n° 2025-175)
npm run verify:prix       # prix annoncé ≠ prix facturé sur un produit à variantes
npm run verify:carte      # carte CBD : identifiants en dur, origines, drapeaux
npm run verify:cache      # empreinte de contenu sur les scripts d'/assets/
npm run test:diagnostic   # exécute réellement l'écran /admin/diagnostic/
npm run test:pages        # exécute les scripts des pages client — aucun ne doit lever
npm run test:sceau        # sceau retour Monetico, décodage du corps compris
npm run test:alertes / test:inventaire / test:reception / test:commandes
```

Les sept `verify:` tournent dans `npm run build` et **font échouer la
construction**. Ce n'est pas de la rigueur gratuite : chacun est né d'un défaut
parti en production sans que rien ne le signale.

⚠ **Le cache d'`/assets/` est d'un an, en `immutable`** (`src/_headers`). Un
fichier servi sous la même URL n'est donc plus jamais rechargé — ni par le
navigateur, ni par le CDN. Toute référence à un script ou à une feuille de
style doit porter son empreinte :

```njk
<script src="/assets/js/exemple.js?v={{ '/assets/js/exemple.js' | contentHash }}" defer></script>
```

Dix-neuf scripts en étaient dépourvus jusqu'au 2026-09-04, dont `header.js`,
`admin-stocks.js` et `produit-detail-achat.js` : **toute correction de
JavaScript pouvait rester invisible un an** sur un navigateur déjà venu.
Constaté sur la production — `rail-onglets.js` servi en 3 328 octets quand le
dépôt en contenait 6 059, `cf-cache-status: HIT`. Le code était juste, le
déploiement réussi, les contrôles au vert, et rien ne changeait à l'écran.
`verify:cache` bloque désormais la construction. **Ne jamais assouplir
`_headers` pour contourner** : le cache long est précieux, c'est l'URL qui
doit changer avec le contenu.

---

## ⚠ Contraintes légales — à ne jamais assouplir

### Aucune allégation de santé sur un produit CBD

Règlement (CE) 1924/2006 et articles L121-2 et suivants du code de la
consommation. La DGCCRF sanctionne régulièrement ce point.

21 fiches en portaient : « effet relaxant profond », « apaisement »,
« anti-stress », « clarté mentale ». Toutes réécrites en langage sensoriel.
**On décrit ce que le produit est et ce qu'on perçoit — jamais ce qu'il fait à
celui qui le consomme.** Le sensoriel vend aussi bien, et il est vrai.

Même règle pour la vape : ne jamais présenter un appareil comme une aide au
sevrage tabagique.

`verify:redaction` bloque le build sur ces formulations. Si un mot y figure à
tort, revoir la formulation — pas la liste. Détail dans
`docs/charte-fiches-produits.md`.

⚠ **Ce contrôle a deux étages, et c'est ce qui le rend tenable.**

| Étage | Contenu | Effet |
|---|---|---|
| **bloquant** | allégations de santé, champ `saveurs` décoratif | fait échouer le build |
| **signalé** | longueurs, superlatifs, points forts manquants | affiché, jamais bloquant |

Il n'en avait qu'un jusqu'au 2026-09-28 : `--strict` tournait dans
`npm run build` et faisait échouer la construction sur **n'importe quel**
écart. Le 2026-09-26, le commerçant a créé une fiche depuis l'éditeur de
contenu sans remplir les points forts. Résultat : **cinq déploiements refusés
d'affilée, et plus rien en ligne pendant deux jours** — ni ses fiches, ni la
carte CBD. Le journal Cloudflare nommait la cause en clair, mais il n'a
aucune raison d'aller l'y lire, et rien dans le back-office ne le signalait.

**Un contrôle de qualité rédactionnelle ne doit pas pouvoir éteindre la
boutique.** C'est la même leçon que `verify:puffs`, qui avertit sans bloquer
sur une réponse fournisseur en attente : un contrôle qui se déclenche sur ce
que le commerçant produit normalement finit par être désactivé en urgence — et
c'est alors la partie légale qu'on perd avec.

`npm run verify:redaction:strict` garde l'ancien comportement, pour une passe
de relecture volontaire. Et `pointsForts` est passé `required: true` dans
`config.yml` : mieux vaut empêcher le cas que le rattraper.

⚠ **Le corollaire vaut pour tout nouveau `verify:`** : avant d'en rendre un
bloquant, se demander *« le commerçant peut-il déclencher ça en travaillant
normalement ? »*. Si oui, il avertit.

### ⚠ Cette règle a été enfreinte trois jours plus tard, par celui qui l'a écrite

Le 2026-09-29, **dix déploiements d'affilée ont été refusés** pendant que le
commerçant modifiait et supprimait des fiches. Rien de neuf dans le mécanisme :
`verify:carte` et `verify:prix`, écrits la veille, bloquaient sur quatre gestes
de son quotidien.

**La cause réelle, lue dans le journal Cloudflare** : deux saveurs ajoutées à
`jnr-32000-puffs` — « Black Dragon ice » et « Fizzi Cherry Cola » — **sans
prix**. On crée la ligne, on écrit le libellé, on enregistre, on remplira le
prix après : c'est le geste le plus banal de l'éditeur de contenu. Il a éteint
la boutique.

⚠ **J'avais d'abord désigné trois autres causes, toutes plausibles et toutes
fausses**, avant de lire le journal. C'est la même erreur de méthode que
pendant les deux jours Monetico. Le journal nomme la cause ; le raisonnement
la devine, et se trompe.

Les gestes qui faisaient tomber la construction, tous corrigés :

| Geste | Contrôle qui tombait |
|---|---|
| **ajouter une saveur sans prix** | `verify:prix` ← la cause réelle |
| supprimer une fiche appelée en dur (`pod-recharge`) | `verify:carte` |
| la désactiver | `verify:carte` |
| décocher les deux « vedettes » | `verify:carte` |
| saisir un prix barré incohérent | `verify:prix` |

**La formulation de la règle était trop faible.** « Se demander si… » invite à
répondre non. La version qui tient :

> **Ne bloquer que ce que le CODE peut casser.** Tout ce qui dépend d'une
> donnée saisie par le commerçant avertit — et c'est la **page** qui se
> dégrade proprement, pas la construction qui tombe.

C'est plus sûr, pas moins : un contrôle bloquant sur une donnée saisie finit
désactivé en urgence, et on perd alors la protection entière.

**Appliqué au prix barré**, cela a même donné une meilleure garantie. Le
contrôle bloquait pour empêcher une annonce de réduction trompeuse ; désormais
`product-card.njk` et `produit-detail.njk` **n'affichent le prix barré que s'il
est strictement supérieur au prix**. La remise mensongère est devenue
impossible à rendre — alors que le blocage, lui, se contentait d'empêcher de
déployer.

**Appliqué aux variantes sans prix, le gain est le même.** `avecPrixCalcule()`
(`prix-fiche.mjs`) les **retire de l'affichage** : le client ne peut plus
choisir une saveur qui ferait refuser sa commande à la validation. Le blocage,
lui, n'empêchait rien de tel — il refusait seulement de déployer. La variante
réapparaît dès que son prix est renseigné, et `variantesEcartees` garde la
trace de ce qui a été écarté plutôt qu'une disparition silencieuse.

⚠ Si **aucune** variante n'a de prix, le produit retombe sur son `prix` de
fiche et se vend comme un produit simple : `build-catalog-index.js` inscrit
toujours `entries[p.id]`, la commande aboutit donc. Vendre sans le choix de
saveur est un moindre mal devant un produit invendable — et devant une
boutique éteinte.

⚠ **Chercher d'abord le `{% if %}` dans le gabarit, avant le `process.exit(1)`
dans le contrôle.** Un site qui affiche une information en moins vaut toujours
mieux qu'un site qui n'existe plus.

Les blocages qui restent dans `verify:carte` sont les trois que le commerçant
ne peut pas atteindre : champ « origine » disparu de `config.yml`, divergence
entre `origines.mjs` et `config.yml`, drapeau réapparu en dur dans le gabarit.

### Aucun avis inventé

Le gabarit contenait deux avis écrits en dur, signés de noms fictifs et marqués
« Achat vérifié », affichés sur les 121 fiches. C'est une pratique commerciale
trompeuse.

Tout avis vient désormais de `/api/avis`, qui exige quatre conditions : la
commande existe, elle appartient à l'adresse qui écrit, elle a été honorée, et
elle contenait ce produit. Modération obligatoire dans `/admin/avis/`.

**Ne jamais remplir `note` ou `nombreAvis` à la main**, et ne jamais
réintroduire `aggregateRating` dans le JSON-LD depuis le catalogue : cela
diffuserait une note inventée jusque dans les résultats Google.

⚠ **Une occurrence subsiste, en connaissance de cause.** `src/index.njk`
affiche « 4.9 ★ / Satisfaction » écrit en dur dans le bandeau de chiffres de
la page d'accueil, alors qu'aucun avis client n'existe encore. C'est la même
nature que les deux faux avis retirés le 2026-08-01. Signalé au commerçant le
2026-08-22, qui a choisi de le laisser pour l'instant — la décision lui
appartient. À reprendre dès que de vrais avis existent, ou avant si la
question de la conformité se pose. Les deux autres chiffres du bandeau
(« 121+ références », « 48h livraison ») sont exacts.

⚠ **Le blog est soumis à la même règle, et c'est là qu'elle sera enfreinte.**
Une fiche produit se tient en trois phrases ; un article de fond invite à
expliquer « à quoi ça sert », et « le CBD aide à mieux dormir » s'écrit tout
seul. La loi ne distingue pas le support. `verify:redaction` passe donc les
fichiers de `src/blog/*.md` par la **même liste d'interdits** que les fiches,
et fait échouer la construction — donc le déploiement de tout le site —
jusqu'à correction. Les contrôles de longueur, eux, ne s'y appliquent pas.

### Aucun dispositif de vapotage à réservoir fixe

Loi n° 2025-175 du 24 février 2025, en vigueur le 25 février 2025. Est
interdite la fabrication, la mise sur le marché, la vente et l'offre à titre
gratuit d'un dispositif de vapotage **à quantité d'e-liquide fixe**. Amende
jusqu'à **100 000 €**, 200 000 € en récidive.

Le texte ne parle pas de la batterie. **Le test est le réservoir, pas la
prise** : un appareil scellé doté d'un port USB-C est « rechargeable » au sens
courant et interdit au sens de la loi. Une note antérieure de ce fichier disait
« dispositifs non rechargeables » — c'était faux, et un appareil non conforme
serait passé pour conforme.

Le champ `liquideRemplissable` porte la réponse, en trois états : `"oui"` (le
client remet du liquide), `"non"` (réservoir scellé, vente interdite), chaîne
vide ou absent (réponse du fournisseur attendue). ⚠ Ce sont des **chaînes** :
le widget `select` de Decap n'accepte ni booléen ni `null`, et un `value: true`
empêche l'éditeur de contenu de démarrer — `verify:cms` le bloque désormais. `verify:puffs` **fait échouer la
construction** si un appareil `false` est encore `actif`, et avertit sans
bloquer sur les états inconnus — bloquer sur une réponse fournisseur en attente
aurait produit un contrôle qu'on finit par désactiver.

Les pods et flacons vendus seuls sont hors périmètre : l'interdiction porte sur
l'appareil à usage unique, pas sur la cartouche d'un appareil réutilisable.

---

## Doctrine : une seule source de vérité

C'est la classe de bug qui a coûté le plus cher ici. Une règle écrite à deux
endroits finit toujours par diverger.

| Règle | Source unique | Généré vers |
|---|---|---|
| Frais de port, délais, créneaux | `src/_data/site.json` → `livraison` | `functions/_shared/livraison.js`, `window.MCV_LIVRAISON` |
| Prix, stock, unités, seuils | `src/data-source/produits/*.json` | `functions/_shared/catalog-index.js` |
| Format des numéros de commande | `functions/_shared/orders.js` | importé partout |
| Validation client | `functions/_shared/valide-client.js` | les deux chemins de commande |

⚠ **`SITE_URL` a une source de vérité jumelle, hors du dépôt.**
`functions/api/auth/login.js` construit `redirect_uri = SITE_URL +
"/api/auth/callback"` et l'envoie à GitHub, qui **refuse toute adresse non
déclarée** dans l'application OAuth. Changer `SITE_URL` sans mettre à jour
l'application casse donc la connexion au back-office — constaté le
2026-09-04, écran « The redirect_uri is not associated with this
application », après la bascule vers le `.fr`.

L'application est **MaisonCBDVape Admin**, `github.com/settings/applications/3622850`
(client `Ov23liwMg8Mc7uBdzJj3`). Le champ **« Add redirect URI » accepte
plusieurs adresses** : ajouter la nouvelle plutôt que remplacer l'ancienne,
sinon les déploiements de préversion `*.pages.dev` perdent leur connexion.

Aucun contrôle du dépôt ne peut attraper ça : la vérité vit chez GitHub.
`docs/deploiement-cloudflare.md` § 12.3 le listait pourtant — il a été lu et
la ligne a quand même été oubliée. D'où cette note, à l'endroit où l'on
regarde avant de toucher à `SITE_URL`.

**Et une troisième copie, dans `admin/contenu/config.yml`** : `base_url`,
`site_url`, `display_url`, `logo_url`. Ce fichier est recopié tel quel vers
`public/` — les filtres Nunjucks n'y sont pas évalués, l'adresse ne peut donc
pas y être générée depuis `site.json`. Elle est écrite en dur, et elle était
restée sur `pages.dev` jusqu'au 2026-09-04. `base_url` est le plus sensible :
c'est l'origine sur laquelle Decap ouvre la fenêtre d'authentification, et un
écart avec l'adresse de retour fait échouer la connexion à l'éditeur de
contenu sans message clair.

**Changer `SITE_URL`, c'est donc changer trois choses :** `wrangler.toml`,
`admin/contenu/config.yml` (4 lignes), et l'application OAuth chez GitHub.

Pour changer un tarif : éditer `site.json`, puis rebuild. **Ne jamais
réintroduire de valeur en dur.**

Une note de ce fichier a longtemps signalé des prix CBD écrits en dur dans
`src/categories/categorie.njk`. **Ce n'est plus vrai** : les tableaux tirent
désormais tout de `produits` (`{{ prod.prix | eur }}`), et une recherche de
prix littéraux dans le fichier ne ramène plus rien. Vérifié le 2026-08-08.
La note est conservée sous cette forme parce qu'un avertissement périmé fait
perdre autant de temps qu'un bug.

---

## Règles d'interface

**Ce qui ressemble à un choix doit en être un.** Deux occurrences en deux jours :

- un bouton « Me prévenir lors du retour en stock » qui était `disabled` et ne
  prévenait personne ;
- un champ `saveurs` rendu en puces dorées qui ressemblaient à des boutons, sans
  que rien n'écoute le clic.

`variantes` est le **seul** champ sélectionnable : grammages des fleurs, saveurs
des puffs, chacun avec son prix et sa ligne de stock.

### Le prix d'un produit à variantes est CALCULÉ, jamais saisi

Il portait deux prix indépendants : `prix` (affiché dans les listes) et celui
de chaque variante (facturé par le panier). Rien ne les reliait, et modifier
un tarif demandait autant de gestes qu'il y avait de variantes, plus un.

Le 2026-09-24, trois fiches divergeaient. Une puff annonçait 15,99 € et aurait
débité 19,90 € — au-delà du bug, une **pratique commerciale trompeuse**
(L121-2). Un pod avait douze variantes **sans prix du tout** : absentes du
catalogue serveur, elles le rendaient invendable, la commande étant refusée à
la validation sans que rien ne l'annonce avant.

**`scripts/prix-fiche.mjs` porte la règle, et lui seul.** Elle est appliquée
par `src/_data/produits.js` (affichage) **et** par `build-catalog-index.js`
(catalogue serveur) : affichage et facturation ne peuvent plus diverger.

| Cas | Prix affiché |
|---|---|
| pas de variantes | `prix`, saisi |
| `unitePrix` renseigné (fleurs) | `prix`, saisi — c'est un prix **au gramme** |
| variantes, sans `unitePrix` | **la variante la moins chère**, calculée |

⚠ **Ne jamais relire `p.prix` directement** dans un gabarit ou un script qui
touche au prix : passer par `prixFiche()`. Une deuxième lecture de la donnée
brute remettrait en place l'écart que ce module supprime.

⚠ **Les fleurs restent à saisie manuelle, et c'est volontaire** : 4,90 €/g
donne 9,80 € les 2 g, l'écart y est la règle et non une anomalie.

### Dégressivité : le prix au gramme est affiché, l'économie est CONSTATÉE

Le 2026-09-29, le commerçant a demandé que le client « voie l'avantage à
prendre 4 g plutôt que 2 ». **Mesure faite avant d'écrire quoi que ce soit :
cet avantage n'existait pas.** Les 17 fiches au gramme étaient strictement
proportionnelles — 8 g à 39,20 € contre quatre fois 9,80 €, à l'euro près.

Une seule s'en écartait, **dans le mauvais sens** : `garlic-hydro-indoor-cbd`
facturait les 2 g **11,99 €, soit 5,995 €/g**, alors que la fiche annonçait
« 4,99 € / g » en gros titre — 20 % au-dessus du tarif affiché. Aligné à
9,98 €.

Afficher « avantage » là-dessus aurait été une annonce de réduction sans
réduction, exactement le terrain que `prixBarre` venait de coûter. D'où le
principe retenu :

> **L'économie se constate, elle ne se déclare pas.**

Chaque conditionnement affiche son **prix au gramme réel** (`.gram-btn-unitaire`),
calculé depuis les données. Le repère **« −X %/g »** (`.gram-btn-eco`)
n'apparaît que si l'économie est réelle. Aujourd'hui il est invisible partout ;
il s'allumera tout seul le jour où un tarif baissera, sans que personne n'ait à
y penser.

⚠ **Seuil à 2 %, et il est mesuré, pas choisi.** Les arrondis créent un bruit
de ±0,9 % — 9,99 € les 10 g font 0,999 €/g quand la fiche annonce 0,99 €/g.
Annoncer « −0,1 % » serait une réduction inventée par l'arrondi. Le
pourcentage est en outre arrondi **vers le bas** : 9,7 % s'affiche « −9 % »,
mieux vaut promettre moins que le client ne reçoit.

⚠ **La référence est le plus petit conditionnement, pas le prix de fiche.**
C'est la comparaison que fait le client — « si je prends 4 g au lieu de 2 ».
Comparer au prix de fiche annoncerait une économie sur un format que personne
ne peut acheter.

⚠ **Deux sélecteurs cohabitent dans `produit-detail.njk`, et ils ne se
ressemblent pas** : `.gram-btn` (`data-gram-*`) pour les fleurs au gramme,
`.variante-btn` (`data-variante-*`) pour les saveurs de puffs. J'ai d'abord
modifié le second en croyant toucher les fleurs — le changement était inerte
et invisible. Vérifier lequel on édite avant de commencer : le bloc des
fleurs est conditionné par `produit.unitePrix == 'g'`.

⚠ Toute classe nouvelle doit exister dans `input.css`, sinon `verify:css` fait
échouer la construction. C'est ce qui a rattrapé l'oubli ici.

**Un second repère, « Meilleur prix/g »** (`.gram-btn-best`), désigne le
conditionnement au plus bas prix unitaire. Le commerçant veut pousser les 4 g,
mais **aucun format n'est nommé dans le gabarit** : le repère suit les
chiffres, et se déplacera tout seul si un autre format devient plus
avantageux. Écrire « 4g » en dur serait reproduire les identifiants figés de
la carte CBD, qui ont coûté une ligne vide et un déploiement.

⚠ Il exige **un minimum unique** et une avance supérieure au seuil. Deux
formats au même prix au gramme : il n'y a pas de « meilleur », et n'en
désigner qu'un serait mensonger — le repère reste éteint.

⚠ **Remiser un seul format rend les plus gros PLUS CHERS au gramme**, et le
client le voit puisque la colonne affiche le prix unitaire. Remiser les 4 g
sans toucher aux 8 g donne 4,41 €/g contre 4,90 €/g : un sachet deux fois plus
gros vendu plus cher au gramme ressemble à une erreur de saisie — et c'en est
une. L'échelle au gramme doit rester **décroissante**.

**`verify:prix` le surveille désormais**, format par format : il compare les
prix au gramme de deux conditionnements voisins et **avertit** dès que le plus
grand repasse au-dessus de plus de 2 % (même seuil que le repère d'économie, et
pour la même raison — les arrondis font ±0,9 % de bruit). Il **n'a pas à
bloquer** : ce sont des prix saisis, et la page reste juste toute seule, elle
affiche le prix réel et n'allume « −X %/g » que sur une économie réelle.

**Les prix CBD sont gérés par le commerçant, référence par référence**
(décidé le 2026-09-29). Ils ne seront pas les mêmes d'une fleur à l'autre : il
n'y a donc **aucune grille à appliquer en lot**, et il ne faut pas en inventer
une. La forme visée est celle qu'il a retenue : **les 4 g au meilleur prix au
gramme** — c'est le format qu'il veut pousser — **et les formats plus grands
jamais au-dessus**, quitte à les remiser un peu moins. Le mécanisme est
entièrement piloté par les données : les deux repères s'allumeront tout seuls
au premier tarif baissé, sans une ligne à écrire.

⚠ **Personne ne relira ces échelles à sa place.** Un prix au gramme qui
remonte ne produit aucune erreur, ne casse aucune page, et se lit pourtant
sous les boutons. Le message de `verify:prix` est le seul endroit où
l'incohérence se voit avant le client.

Aucune dégressivité n'existe à ce jour : les 17 fiches au gramme sont
proportionnelles, donc les deux repères sont éteints partout. Deux fiches small
buds gardent un écart de 0,9 % dû à un prix psychologique (9,99 € les 10 g au
lieu de 9,90 €) : sous le seuil, donc sans effet.

**Côté commerçant, modifier un tarif = modifier les variantes.** Le champ
« Prix » de l'éditeur est ignoré dès qu'il y a des variantes ; son `hint` dans
`admin/contenu/config.yml` le dit explicitement, parce qu'un champ qui ne fait
rien est exactement ce que les règles d'interface ci-dessus interdisent.

### Le prix d'une variante est FACULTATIF : vide, il est hérité

Depuis le 2026-09-29, à la demande du commerçant, qui vend ses saveurs au même
tarif. **Prix de variante vide → la variante se vend au prix de la fiche.** Le
champ reste disponible pour le jour où une saveur vaudra plus cher.

Trois raisons, dans cet ordre d'importance :

1. **Moins de façons de se tromper.** Quatre champs à tenir cohérents, c'est
   quatre occasions d'en oublier un — c'est ainsi qu'une puff a annoncé
   15,99 € et failli facturer 19,90 €.
2. **Un tarif se change en un geste** au lieu d'autant de gestes qu'il y a de
   saveurs.
3. Une saveur ajoutée sans prix devient normale, et non plus une anomalie qui
   a éteint la boutique dix déploiements d'affilée.

⚠ **Les variantes ne peuvent PAS être supprimées pour autant.** Elles portent
aussi le **stock par saveur** : `build-catalog-index.js` tient une ligne
`jnr-32000-puffs::Cherry ICE` distincte. Sans elles, le site vendrait une
saveur épuisée.

⚠ **L'héritage est REFUSÉ sur une fiche au gramme**, et cette exception ne se
lève jamais. Quand `unitePrix` est renseigné, `prix` vaut UN GRAMME (4,90 €) :
un sachet de 4 g qui en hériterait serait vendu 4,90 € au lieu de 19,60 €. Là,
la variante sans prix est **écartée de la vente** et `verify:prix` le signale.

**`variantesVendables()` (`prix-fiche.mjs`) porte la règle, et elle seule.**
`src/_data/produits.js` (affichage) **et** `build-catalog-index.js` (catalogue
serveur) l'appellent tous les deux.

⚠ **Elle fait plus qu'ajouter un prix : elle normalise aussi les libellés
(`trim`).** Et c'est ce détail qui a failli tout casser à l'écriture : un
raccourci « rien n'a changé, on rend la fiche telle quelle » laissait passer
les libellés bruts à l'affichage pendant que le catalogue recevait les
libellés nettoyés. Sur `pod-de-remplacement-aerox-32k-jnr`, deux saveurs se
terminaient par une espace : la page proposait « Pastèque Glacée␣ », le
catalogue connaissait « Pastèque Glacée », et la commande aurait été refusée
sur un « prix introuvable ». **Dès qu'il y a des variantes, on rend toujours la
version résolue — jamais de raccourci.**

Le contrôle est automatisable et mérite de l'être : comparer, pour chaque
`data-variante-label` / `data-variante-prix` des pages construites, la valeur
du `CATALOG` correspondant. Zéro écart sur 39 variantes au 2026-09-29.

`verify:prix` ne contrôle donc plus l'égalité — elle est structurelle — mais
qu'**aucune variante n'est dépourvue de prix ou de libellé**, le défaut qui
rend un produit silencieusement invendable.

### ⚠ `unitePrix` vide sur une fleur : le défaut qui en cache un autre

Le 2026-09-28, `garlic-hydro-indoor-cbd` affichait **11,99 € barré de 6,99 €**
— un « ancien prix » moins cher que le nouveau. Le badge « Promo » et le prix
barré sont posés automatiquement dès que `prixBarre` existe ; personne ne relit
la cohérence des deux nombres.

Mais le prix barré n'était pas la cause. Le commerçant avait laissé
**« Unité de prix » vide** sur une fiche à grammages. `prixFiche()` bascule
alors sur « la variante la moins chère » : le prix de fiche devenait le pack de
2 g (11,99 €) au lieu du gramme (4,99 €). D'où deux conséquences d'un seul
champ oublié :

- le catalogue annonçait **11,99 € dans une colonne « €/g »**, à côté de
  voisines à 4,90 — le client compare deux choses différentes sur la même
  ligne ;
- le prix barré, juste par rapport au gramme, devenait **une annonce de
  réduction trompeuse** par rapport au pack (L121-2 et les règles propres aux
  annonces de réduction de prix).

`verify:prix` surveille désormais les deux, à deux niveaux :

| Contrôle | Effet | Pourquoi |
|---|---|---|
| `prixBarre` ≤ prix affiché | **bloque** | annonce de réduction trompeuse — juridique |
| variantes toutes en grammes sans `unitePrix` | avertit | le repère est le libellé (`2g`, `4g`), donc heuristique |

⚠ La comparaison du prix barré porte sur **`prixFiche()`**, le prix réellement
affiché, et non sur `fiche.prix` brut. Comparer la donnée brute aurait raté
exactement ce cas, puisque `fiche.prix` valait 4,99 et que seul le calcul
produisait 11,99.

Deux fiches étaient concernées : `garlic-hydro-indoor-cbd` et
`smash-small-bud-cbd`, toutes deux passées en `unitePrix: "g"`. Le libellé de
variante `"8"` a été corrigé en `"8g"` au passage.

**Une variante peut porter sa propre photo** (champ `image`, facultatif,
ajouté le 2026-09-24). Elle remplace la photo principale quand le client
choisit la saveur, et **le suit jusque dans son panier et sa confirmation de
commande** — le commerçant prépare ainsi la bonne référence.

⚠ Trois rendus la réclament : la fiche (`syncVariante`), le panier, et
`buildOrderItems`. Ils passent tous par **`imageDeVariante(p, label)`** dans
`tabacgex.js`. Les laisser chercher chacun de leur côté ferait diverger ce
qui est affiché de ce qui est commandé — la même famille de défaut que
« prix annoncé ≠ prix facturé ».

Sans photo de variante, on retombe sur celle du produit : le champ est
facultatif et il l'est réellement. `syncVariante` **rétablit** la photo
d'origine quand la saveur choisie n'en a pas — sinon celle de la saveur
précédente resterait affichée et mentirait au client. Les valeurs initiales
(`src` et `alt`) sont mémorisées au chargement, jamais relues depuis
l'élément au moment du clic : elles auraient déjà été remplacées.

Le champ n'a pas d'intérêt sur les fleurs au gramme — le bocal est le même
quel que soit le contenant — mais rien ne l'interdit.

**Aucune saveur n'est présélectionnée à l'arrivée** (2026-09-24). Présélectionner
la première faisait acheter par défaut une saveur que le client n'avait pas
demandée, et affichait sa photo comme si c'était celle du produit. Tant qu'il
n'a pas choisi : photo du produit, libellé « à choisir », et prix **« dès
X € »** — `produit.prix` étant déjà la variante la moins chère.

⚠ **Contrepartie : l'achat sans choix devient possible, et il est refusé.**
`choixDeVarianteManquant()` (`tabacgex.js`) arrête l'ajout au panier ET le
Click & Collect, affiche « Choisissez d'abord une saveur » et met le bloc en
évidence (`.reclame-choix`). **Les deux moitiés se tiennent** : rétablir une
présélection sans retirer ce garde-fou, ou l'inverse, casse la fiche.

Le bouton reste doré et cliquable, volontairement : un bouton grisé éteindrait
l'appel à l'action principal dès l'arrivée — et ce projet a déjà payé un
bouton `disabled` qui semblait cliquable.

⚠ Le garde-fou ne vaut que pour les boutons du produit affiché
(`#zone-achat`, `#sticky-buy`, `#click-collect-btn`). Les cartes de produits
associés ont leurs propres boutons et **aucun sélecteur**.

### ⚠ Une carte ne peut pas vendre une saveur — et c'était un défaut de STOCK

Cette dernière phrase disait, jusqu'au 2026-10-03, « les bloquer les rendrait
inutilisables ». C'était vrai et insuffisant : le problème n'était pas
l'ergonomie, c'était le stock.

Les cartes portent `data-add-to-cart="{{ produit.id }}"` **sans variante**.
L'article partait donc au panier sans saveur et se résolvait sur la **clé NUE**
du produit (`resoudreStock(id, null)`) — une ligne distincte de celles qui
portent le stock par saveur. **Les mêmes pods étaient comptés deux fois**, et
le commerçant aurait préparé une commande sans savoir quelle saveur expédier.

Révélé par le premier semis réel : `pod-al-fakher-50k` n'avait pas de ligne nue
et affichait une erreur au client, tandis que trois autres en avaient une,
héritée d'un vieux semis, et « marchaient » en double-comptant. **L'erreur
était le moins mauvais des deux comportements** — et c'est elle qui a mis le
défaut au jour.

⚠ **Semer la clé nue aurait été le mauvais réflexe.** L'erreur disparaissait,
le double comptage s'installait partout. Un symptôme qui s'éteint n'est pas une
cause qui se corrige.

La carte d'un produit à saveurs affiche donc **« Choisir une saveur »** et mène
à la fiche, où le sélecteur existe et où `choixDeVarianteManquant()` monte déjà
la garde. C'est la règle du projet appliquée dans les deux sens : ce qui
ressemble à un choix doit en être un, et on ne choisit pas à la place du client.

⚠ **Ne vaut QUE pour les saveurs vendues à l'unité** (`produit.unitePrix != 'g'`).
Une fleur au gramme tire d'un vrac unique : son conditionnement ne change pas la
ligne de stock, l'ajout direct depuis une carte y reste juste. Vérifié sur le
site construit — les quatre produits à saveurs n'ont plus aucun
`data-add-to-cart` hors de leur propre fiche, les fleurs et les produits simples
l'ont gardé.

Quatre produits concernés au 2026-10-03 : `pod-al-fakher-50k` (33 saveurs),
`e-liquide-jnr-10ml-20mg-sel-de-nicotine` (22),
`pod-de-remplacement-aerox-32k-jnr` (12), `jnr-32000-puffs` (5).

⚠ **Les lignes nues héritées restent en base**, et c'est volontaire : elles
n'ont plus de chemin d'accès, `db:comparer` les signale comme orphelines, et
les effacer n'apporterait rien avant la saisie des stocks réels.

Troisième occurrence, la plus coûteuse : le bouton **« Payer en ligne (CB) »**
s'affichait sans condition, alors que `create-payment.js` refuse de construire
un formulaire sans `MONETICO_TPE` ni `MONETICO_SOCIETE`. Un client arrivé au
bout du tunnel, prêt à payer, tombait sur une erreur — et ne recommence pas.
Il est désormais conditionné à `monetico.configure` (`src/_data/monetico.js`,
qui lit `wrangler.toml`, source unique). Quand il est masqué, le retrait en
boutique passe en bouton principal : ce n'est plus une alternative, c'est le
parcours. Et `MONETICO_ENV = "production"` sans identifiants **fait échouer la
construction**, pour qu'on ne déploie jamais une boutique qui se croit en
encaissement réel.

### La carte CBD ne contient plus aucune donnée produit

`/categories/cbd/` affiche une « carte » en cinq panneaux, seul écran du site
qui mélange données de fiches et choix éditoriaux. Les prix, noms et taux de
CBD en venaient déjà ; **le reste était écrit dans le gabarit**, et trois
défauts y ont vécu côte à côte jusqu'au 2026-09-27.

**1. Les drapeaux étaient posés par panneau, pas par produit.** 🇫🇷 sur toute
la colonne Indoor, 🇨🇭 sur le seul Extract Crumble, 🇪🇺 sur les Small Buds.
Or le Moon Rock annonce « Origine : Union européenne » dans sa fiche
technique et affichait 🇫🇷 sur la carte, à deux clics d'écart. Une origine
est une **mention commerciale** au même titre qu'un prix (L121-2) : c'est
exactement la famille de défaut que `prix-fiche.mjs` a fermée côté tarifs.

`scripts/origines.mjs` porte la liste, et lui seul. Le champ `origine` est une
**liste fermée** — en saisie libre, « Suisse », « suisse » et « CH » donneraient
trois valeurs dont aucune n'a de drapeau, et la carte se dégraderait sans
bruit. Les gabarits passent par les filtres `| drapeau` et `| origineLisible`.

⚠ **Une origine absente n'affiche RIEN**, jamais un drapeau par défaut.
Inventer 🇫🇷 sur une fiche non renseignée serait une mention commerciale
fausse produite par le gabarit lui-même — pire que l'absence d'information.

⚠ **Les drapeaux sont des SVG dessinés dans `origines.mjs`, pas des émojis.**
Le 2026-09-28, le commerçant a signalé que la colonne affichait « IT », « EU »
au lieu de drapeaux. Le HTML contenait pourtant bien `🇮🇹` : **Windows ne
fournit aucune police de drapeaux**, et les navigateurs y rendent à la place
le couple de lettres qui compose le caractère. Un visiteur sur iPhone voyait
un drapeau, un visiteur sur PC deux lettres — et la clientèle est
majoritairement sur PC.

Chaque origine porte donc trois choses : `emoji` (libellés de `config.yml`,
où le rendu système suffit, et contrôle de `verify:carte`), `code` (FR, CH…),
et **`svg`**, le dessin servi avec la page. Aucun appel extérieur, comme pour
les polices.

⚠ **Le filtre renvoie du BALISAGE** : écrire `| drapeau | safe` dans le
gabarit. Sans `safe`, Nunjucks échappe le SVG et la colonne affiche son code
source.

⚠ **Les dessins sont simplifiés, et les rayons ont été mesurés.** Une première
version posait les douze points européens à un rayon de 0,09 : rapporté à
18 px de large, un demi-pixel — le drapeau n'était qu'un rectangle bleu. Ne
pas « améliorer » en ajoutant du détail invisible à cette taille : les
cinquante étoiles américaines sont six points, et c'est volontaire.

⚠ **`admin/contenu/config.yml` en porte une copie**, pour la raison habituelle :
il est recopié tel quel vers `public/`, les filtres Nunjucks n'y sont pas
évalués. `verify:carte` compare les deux listes. Ajouter un pays, c'est le
faire aux deux endroits.

**2. Les têtes d'affiche étaient appelées par identifiant.** Désactiver
`moon-rock-cbd-indoor` depuis l'éditeur de contenu vidait sa ligne — nom
absent, lien vers `/produits//` — sans erreur ni message. Elles sortent
maintenant du champ **`carteVedette`**, une case à cocher. Une vedette est
affichée en tête **et retirée de la liste de son panneau** : les deux filtres
`| vedettes` et `| sansVedettes` se tiennent, en utiliser un sans l'autre fait
paraître le produit deux fois.

⚠ Nunjucks n'a pas d'opérateur séquence : `{% set l = (l.push(x), l) %}` ne
filtre rien. D'où ces deux filtres plutôt qu'une boucle dans le gabarit.

**3. Le panneau « Greenhouse » affichait la même liste que « Small Buds ».**
Aucune sous-catégorie « greenhouse » n'existait. Le même produit paraissait
deux fois, ce qui laissait croire à un catalogue plus large qu'il n'est.
`fleurs-greenhouse` existe désormais ; le panneau annonce « sélection en cours
de constitution » tant qu'il est vide, plutôt que d'emprunter les produits du
voisin.

Le badge **« 🇫🇷 Origine France »** du bas de ce panneau a été retiré : il
affirmait une origine pour tout un panneau alors que chaque fiche porte la
sienne.

**`verify:carte` bloque la construction** sur : un identifiant en dur devenu
inexistant ou inactif, une origine hors liste, une divergence entre
`origines.mjs` et `config.yml`, une carte sans aucune vedette, et **tout
drapeau réapparu en dur dans le gabarit**. Il avertit sans bloquer sur les
fiches CBD sans origine — bloquer là-dessus produirait un contrôle qu'on finit
par désactiver, et une origine absente est le bon comportement.

⚠ Ce dernier point s'est retourné contre lui-même à l'écriture : la première
version cherchait les drapeaux ligne à ligne et se déclenchait sur son propre
commentaire, qui en cite un pour expliquer le défaut. Les commentaires
Nunjucks sont retirés **par bloc** avant la recherche.

**Un seul identifiant reste en dur**, assumé : l'encart « Accessoire » qui
pointe `pod-recharge` dans le panneau Small Buds. C'est un encart éditorial,
pas une liste. Son `{% if %}` n'est pas décoratif, et `verify:carte` le
surveille.

⚠ **Dix fiches CBD n'ont pas d'origine** au 2026-09-27 — les résines, les
pollens, les small buds, les mélanges végétaux et l'Extract Crumble. Leur
colonne « Orig. » est vide. L'Extract Crumble affichait 🇨🇭 : ce drapeau
venait du gabarit, pas d'une donnée, et n'a **pas** été migré — recopier une
affirmation dont on ignore la source, c'est la blanchir.

### La fiche technique est une LISTE de paires, plus jamais un objet

Le commerçant a signalé le 2026-09-28 qu'il ne pouvait rien modifier dans le
bloc « Fiche technique » de l'éditeur de contenu. Le formulaire affichait le
libellé hors du cadre et **la même valeur recopiée dans « Caractéristique » et
dans « Valeur »**.

Ce n'était pas un bug d'affichage : **le champ déclaré et la donnée n'avaient
pas la même forme**. `config.yml` déclare `widget: list` avec deux sous-champs
`cle` et `valeur` — c'est la seule chose que Decap sache faire, il n'a pas de
widget pour un objet à clés libres (`BRIEF.md` le notait déjà). Or les 139
fiches, écrites à la main avant l'éditeur, portaient un objet :
`{ "Type": "…", "Taux de CBD": "…" }`. Decap tentait de le faire tenir dans sa
liste, et le résultat n'était modifiable par personne.

**Les 117 fiches concernées sont migrées** en `[{ "cle": …, "valeur": … }]`,
567 lignes au total. `verify:carte` refuse désormais un objet, pour que le
retour en arrière soit impossible.

⚠ **Ne jamais lire `produit.ficheTechnique["Taux de CBD"]`** dans un gabarit :
cette écriture ne fonctionne que sur la forme objet. Passer par le filtre
**`| valeurFiche("…")`**, qui lit les deux formes et ignore casse et espaces.
La carte CBD portait cinq de ces lectures directes : à la migration, ses cinq
colonnes « CBD » seraient toutes retombées sur « — » sans la moindre erreur.

Même piège côté navigateur : la recherche de `tabacgex.js` faisait
`Object.values(p.ficheTechnique)`, qui renvoie `[]` sur une liste. Les
caractéristiques d'une fiche enregistrée depuis le back-office étaient donc
introuvables à la recherche — silencieusement.

**La leçon** : un champ qu'on ne peut pas modifier dans l'éditeur n'est pas un
défaut de l'éditeur. C'est presque toujours un écart entre ce que `config.yml`
déclare et ce que les fichiers contiennent. Comparer les deux avant de
chercher ailleurs.

**Et `verify:cms` le compare désormais tout seul.** Il ne contrôlait que la
cohérence **interne** du fichier de configuration — doublons, options, longueur
des `summary` — sans jamais l'ouvrir en regard des fiches. C'est ce qui a
laissé `ficheTechnique` diverger pendant des mois : déclarée `list`, écrite en
objet, et personne n'avait ouvert ce bloc.

Il déduit maintenant de chaque `widget` la forme JS attendue (`list` → tableau,
`boolean` → booléen, `number` → nombre, `string`/`text`/`image`/… → chaîne) et
la compare à ce que portent réellement les 139 fiches. Une divergence fait
échouer la construction, en nommant le champ, la forme trouvée et trois
exemples — pas 139 lignes identiques.

⚠ **Une valeur vide n'est pas une divergence**, quelle que soit son enveloppe :
`""`, `{}` et `[]` veulent tous dire « pas renseigné », et Decap comme les
anciens imports ne s'accordent pas sur celle qu'ils écrivent. Bloquer là-dessus
aurait produit un contrôle qui échoue sur le travail quotidien du commerçant.
Seule compte une valeur **remplie** dans la mauvaise forme — c'est elle qui
rend le formulaire inutilisable.

Ce contrôle a trouvé deux écarts dès sa première exécution : 20 fiches chicha
et charbons avec `"ficheTechnique": {}`, et `"prixBarre": ""` sur
`smash-small-bud-cbd`. Tous normalisés (`[]` et `null`).

⚠ **Les widgets inconnus ne sont pas contrôlés**, volontairement : `relation`,
`code`, un widget personnalisé. Le script ne se prononce que sur ce dont il
connaît la forme, plutôt que d'inventer une règle et de bloquer à tort.

### ⚠ `.hidden` est en `!important` — et cela a coûté le menu du site

`tailwind/input.css` se termine par `.hidden { display:none !important }`.
La raison est bonne : les classes de composant y déclarent leur propre
`display` et, écrites après les utilitaires, l'emportaient sur `.hidden` —
c'est ainsi que le bouton « Payer en ligne (CB) » est resté visible du public
pendant la recette bancaire, pointant vers la plateforme de test.

**Mais ce `!important` battait aussi les utilitaires responsives.** Or
`hidden lg:flex` — « masqué en dessous de 1024 px, affiché au-delà » — est le
motif Tailwind normal, et c'est celui du **menu principal**
(`partials/header.njk`). Résultat, constaté le 2026-09-24 : **plus aucun menu
sur ordinateur**, à toutes les largeurs. Douze jours après la cause.

Ce qui a rendu le défaut si discret : le burger porte `lg:hidden`, qui donne
également `display:none`. Les deux moitiés du menu disparaissaient donc en
même temps, sans jamais se contredire à l'écran — il ne restait que le logo et
trois icônes, ce qui a l'air d'un choix de design.

`input.css` rend désormais la main aux utilitaires responsives, **un par un**,
après la règle `.hidden`. Aujourd'hui : `sm:flex`, `lg:flex`, `lg:block`,
`lg:grid` — la liste exacte de ce que Tailwind génère pour ce site, relevée
dans la feuille compilée et non devinée.

⚠ **Ajouter un `md:flex` ou un `xl:block` dans un gabarit suppose d'ajouter
la règle correspondante** dans ce bloc. `verify:css` le contrôle : il relève
les utilitaires d'affichage responsives employés dans `src/` et échoue si
l'un d'eux n'est pas rendu.

⚠ **Réciproquement**, un élément que le script masque en lui ajoutant `hidden`
ne doit pas porter l'un de ces utilitaires : il réapparaîtrait au-delà du
point de rupture. Les quatre éléments concernés sont tous du motif responsive
pur, aucun n'est piloté par le script — vérifié avant d'écrire la règle.

**La leçon de méthode** : la cause a été trouvée en lisant la feuille
**servie** (`.hidden{display:none!important}` avant `.lg\:flex{display:flex}`)
et en créant un élément de test dans la page réelle, pas en relisant les
gabarits — qui étaient corrects.

### Ce que l'audit extérieur du 2026-09-30 a corrigé — et ce qu'il a manqué

Un audit de direction artistique commandé par le commerçant. Honnête sur sa
méthode, et il a trouvé de vraies choses qu'aucun `verify:` ne pouvait voir,
parce qu'aucun ne regarde une page **de l'extérieur**.

⚠ **Il annonçait lui-même avoir été préparé avec une IA, et deux de ses trois
alertes les plus graves étaient fausses.** Il déduisait du nom de marque :
« Al Fakher, Starbuzz, Adalya » → tabac à narguilé → vente à distance
interdite. Or les 20 fiches chicha sont toutes `actif: false` et les deux
références Al Fakher actives sont des **pods de vape**. Il alertait aussi sur
une puff dont la fiche était déjà supprimée. **Recouper avant d'agir** : la
vérification a pris dix minutes et a évité de « corriger » un catalogue juste.

Ce qui était vrai et a été traité :

| Constat | Correction |
|---|---|
| Titre d'accueil dupliqué | filtre `titrePage` (voir plus bas) |
| `og:image` absente | `scripts/generer-og-image.mjs` + repli dans `head.njk` |
| Lien « Espace pro » vers `/admin/` en pied public | retiré |
| `--muted` sous le seuil AA sur les cartes | éclairci, mesuré |
| Aucun anneau de focus clavier | `:focus-visible` global |

⚠ **Le titre dupliqué n'était pas où il le disait.** Corriger le front matter
de `index.njk` a suffi pour l'accueil — et la construction suivante a montré
« Al Fakher … 50K | MaisonCBDVape | MaisonCBDVape » sur une fiche. Les 8 fiches
qui portent un `seo.title` écrivent **toutes** la marque dedans.

Corriger ces 8 fiches n'aurait rien réglé : le champ « Titre SEO » est libre
dans l'éditeur, et y écrire le nom de la boutique est le réflexe de tout le
monde. D'où le filtre **`titrePage`** (`eleventy.config.js`) : il retire le
suffixe s'il est là, puis l'ajoute une fois. Écrit ou non, le résultat est le
même. Vérifié sur les 161 pages construites, zéro duplication.

⚠ **`og:image` ne doit JAMAIS être conditionnelle.** Elle l'était, et comme
seules les fiches produits définissaient `ogImage`, tout le reste du site
partait sans visuel — pendant que `twitter:card` annonçait
`summary_large_image`, donc une grande image. Un lien partagé sortait en carte
grise.

`npm run og:generer` dessine le repli **depuis les tokens et `site.json`**, pas
depuis un export d'outil de design : la carte suit la charte. Il n'est
volontairement **pas** dans `npm run build` — il produirait un PNG à chaque
construction, donc un binaire modifié à chaque commit.

⚠ **Et si ce visuel change un jour, son URL ne change pas** : `/assets/` est en
cache d'un an `immutable`, et les plateformes sociales gardent en plus leur
propre copie. Renommer le fichier, ou purger — exactement le piège des images
R2 réécrites en place.

⚠ **Les contrastes ont été recalculés, pas recopiés.** L'audit donnait ses
ratios ; ils se vérifient en dix lignes de JavaScript, et ils étaient justes.
`--muted` (#8A8070) donnait 4,59:1 sur le fond principal — au seuil — mais
**4,26:1 sur les cartes et 3,87:1 sur `--dark3`**, là où il sert le plus.

**La leçon : mesurer une couleur sur le fond de la page ne dit rien de son
rendu sur une carte posée dessus.** Même piège sur le badge « En stock », dont
le fond vert à 12 % éclaircit encore le fond et fait passer le texte sous le
seuil que le calcul sur couleur nue annonçait atteint.

⚠ **Et `.stock-badge` portait `#4A9E5C` en dur**, recopié de `--green` :
éclaircir le token n'aurait rien changé, et le badge serait resté illisible
pendant qu'on croyait l'avoir corrigé. La deuxième source de vérité, encore.

⚠ **`:focus-visible`, jamais `:focus`.** Le site n'avait aucun anneau de focus
général : trois composants définissaient le leur, tout le reste héritait du
contour par défaut que le preflight Tailwind retire. Naviguer au clavier
revenait à avancer sans curseur. En `--gold-light` et non `--gold` : l'anneau
doit rester visible **sur** un élément déjà doré.

⚠ **Le panier n'annonçait pas son contenu.** `aria-label="Mon panier"`
**remplace** le contenu de l'élément : la pastille affichait « 3 », elle
n'était jamais lue. `updateCartBadge()` réécrit maintenant le libellé
(`data-panier-lien`). L'audit accusait l'absence d'`aria-label` — ils étaient
tous là ; le défaut était l'inverse, un libellé qui masquait l'information.

**Et surtout, ce que l'audit ne pouvait pas voir.** Il n'a testé ni le mobile,
ni le tunnel de commande — les deux endroits qui décident si l'argent arrive.
Ses P1 sont cosmétiques devant : un premier paiement réel jamais vérifié, 163
stocks à leur valeur de semis, et « accepté par Resend » qui ne veut pas dire
« reçu ». **Un audit de DA ne hiérarchise pas un lancement.**

⚠ **Deux de ses conseils sont à NE PAS appliquer tels quels** : ajouter
`AggregateRating` au JSON-LD (diffuserait la note inventée jusque dans Google —
voir « Aucun avis inventé »), et afficher « Économisez X € » sur les paliers
(annonce de réduction sans réduction tant que les prix ne sont pas dégressifs).
Il se contredit par ailleurs : il demande de retirer les badges « bestsellers »
sur la vape (publicité interdite) et recommande d'en afficher sur l'accueil.

### ⚠ « dès » sur une fiche au gramme annonçait un prix que rien ne coûte

Trouvé en regardant l'aperçu d'une fiche pendant la passe ci-dessus — pas par
un contrôle, et l'audit ne l'avait pas vu non plus.

Le bloc prix affichait `dès {{ produit.prix }}`. Sur une fiche à saveurs,
`produit.prix` **est** la variante la moins chère et « dès » est juste. Sur une
fiche au gramme, `produit.prix` vaut **UN GRAMME** : l'Amnésia annonçait
« dès 4,99 € » quand le plus petit sachet achetable coûte 19,99 €.

⚠ **Le JavaScript le corrigeait au chargement**, `syncGram()` posant le prix du
premier contenant. Le défaut était donc invisible — jusqu'au jour où un script
meurt, ce qui est arrivé **deux fois** dans ce projet (`admin-commandes`,
`categorie-menu`). Un prix faux derrière un correctif en JavaScript, c'est un
prix faux.

Le gabarit rend désormais, côté serveur, le prix du premier contenant, sans
« dès ». Le prix au gramme reste en tête du bloc « Contenant », où il est juste.
**Les deux blocs (principal et barre collante) portent la même règle** — n'en
corriger qu'un remettrait l'écart à l'endroit le plus visible sur mobile.
Vérifié sur les 13 fiches au gramme construites : aucune ne dit plus « dès ».

### ⚠ « L'écran est coupé à droite » — un enfant de grille ne rétrécit pas tout seul

Signalé le 2026-10-02 depuis un téléphone. Mesuré sur le site en production,
à 320 px de large : la carte « RÉCAPITULATIF » de `/commande/` faisait **457 px**,
bord droit à 473. Le prix, posé de 384 à 444, était **entièrement hors écran**
— un client ne voyait pas ce qu'il allait payer.

Le `<form class="grid lg:grid-cols-3">` faisait pourtant bien 288 px. C'est sa
**colonne implicite** qui était calculée à 456,594 px : un enfant de grille a
`min-width: auto` par défaut, et cela **lui interdit de descendre sous sa
largeur min-content**. Un seul texte en `white-space: nowrap` dans la colonne
suffit à poser ce plancher — ici le nom du produit, devenu long depuis que le
commerçant a ajouté la glose française à ses saveurs.

Correction : `.grid > * { min-width: 0 }` dans `input.css`.

⚠ **`.truncate` ne protège pas de ça.** Il pose `overflow:hidden`, ce qui
annule la taille minimale automatique d'un enfant de **flex** — mais la colonne
de la grille est calculée plus haut, et la troncature se contente alors de
remplir une colonne déjà trop large.

⚠ **Le symptôme est invisible à la mesure évidente.** `html, body
{ overflow-x: hidden }` **plafonne `scrollWidth`** à la largeur de la fenêtre :
`document.documentElement.scrollWidth === clientWidth` quoi qu'il arrive. Ma
première mesure a donc conclu « aucun débordement » pendant que la moitié de la
carte était hors écran. **Comparer le `getBoundingClientRect().right` des
éléments à la largeur de la fenêtre**, et ignorer ceux dont un ancêtre est en
`overflow:hidden` (le méga-menu en sort toujours, c'est normal).

⚠ **Vérifié avant d'écrire la règle**, en l'injectant sur les pages en
production : inerte sur `/categories/cbd/` et `/panier/` (nombre d'éléments
débordants inchangé), décisive sur `/commande/` — colonne 457 → 288, plus aucun
débordement. Une règle aussi large ne se pose pas sans cette mesure.

⚠ **Si une grille doit garder une colonne plus large que l'écran** (un tableau),
ce n'est pas cette règle qu'il faut retirer : c'est au conteneur de porter
`overflow-x: auto`, pour que le contenu reste atteignable en faisant glisser.
`/admin/stocks/` le fait déjà. **Masquer n'est pas afficher.**

**Et le mobile n'est toujours pas testé par un contrôle.** `test:pages`
n'exécute que du JavaScript, sans moteur de rendu : il ne voit aucune largeur.
Ce défaut-là ne s'attrape qu'en ouvrant la page à un gabarit étroit.

**Les icônes ne sont pas des emojis.** `components/icone.njk` pose la classe
`.icone` sur chaque SVG, qui le remet en `inline-block` — sans quoi le preflight
Tailwind (`svg { display: block }`) le colle à gauche dans un conteneur
`text-center`. Toute taille passée à `icone()` doit exister dans la feuille
compilée : `verify:css` le contrôle, parce qu'une taille absente donne un SVG
sans dimension, étiré à **958 px** de côté, sans la moindre erreur.

---

## Environnement

**Le projet ne doit pas vivre dans OneDrive.** Il verrouille les fichiers
pendant la synchronisation et `eleventy --serve` échoue en `EBUSY` au bout d'une
vingtaine de pages. Chemin actuel : `C:\dev\maisoncbdvape-eleventy`.

**`src/data-source/` doit rester dans les `addWatchTarget`.** Les fiches y
vivent mais sont lues par `src/_data/produits.js` ; sans ce watch, `npm start`
sert indéfiniment l'ancien catalogue et on croit à tort que rien ne s'applique.

**Fins de ligne.** Quatre fichiers de `functions/` apparaissent en permanence
comme modifiés alors que leur contenu est identique — un frottement CRLF. Pour
s'en débarrasser : `git config core.autocrlf true` puis
`git checkout -- functions/`.

**Ne jamais reconstruire un fichier depuis zéro** si une version commitée
existe : `git show HEAD~N:fichier > fichier`. Et ne pas utiliser `cat >>` pour
compléter un fichier — l'opérateur duplique le contenu sur un fichier déjà
partiellement écrit. Préférer une réécriture complète ou un remplacement ciblé.

**Polices auto-hébergées, plus aucun appel tiers.** Cormorant Garamond, DM
Sans et Space Mono venaient de `fonts.googleapis.com`/`fonts.gstatic.com` —
deux requêtes qui envoyaient l'IP du visiteur à Google à chaque visite,
le seul appel tiers du site. Les `.woff2` (sous-ensembles latin + latin-ext
seulement, le site ne sert que du français) vivent maintenant dans
`src/assets/fonts/`, déclarés en `@font-face` en tête de `tailwind/input.css`.
Pour ajouter ou changer une graisse : reprendre l'URL
`fonts.googleapis.com/css2?family=…` avec les poids voulus, ne garder que les
blocs commentés `/* latin */` et `/* latin-ext */` de la réponse, télécharger
les `.woff2` qu'ils pointent. Les deux `<link rel="preload">` de `head.njk`
ne visent que les graisses du premier rendu (titre, corps de texte) — pas
la police entière.

---

## Ce qui reste à faire

**Saisir les stocks réels.** 163 références sont encore à leur valeur de semis
(10) dans `/admin/stocks/`. Le stock est la limite serveur d'une commande : tant
que les quantités sont fausses, le site accepte ou refuse des ventes sans
rapport avec la réalité du magasin. Pour les 19 fleurs, l'unité est le **gramme
de vrac**, pas le sachet — un bocal de 500 g se saisit `500`.

**En attente d'accès externes :** compte Mondial Relay Start, contrat Colissimo
Entreprise.

✅ **La boîte `contact@maisoncbdvape.fr` existe depuis le 2026-10-03**, et
l'adresse a été retirée de la liste de suppression Resend — l'étape invisible
de la procédure ci-dessous. Une commande de test en **retrait boutique** a été
passée dans la foulée.

⚠ **Ce qui n'est PAS encore prouvé**, et qu'il ne faut pas conclure de ce qui
précède : qu'un e-mail soit **remis**. « Accepté par Resend » n'est pas
« reçu » (voir plus bas), et le `reply-to` ne se vérifie qu'en **répondant** à
la confirmation reçue côté client. Tant que le journal Resend n'affiche pas
*Delivered* sur les **deux** destinataires, la chaîne e-mail reste à l'état
d'hypothèse.

**L'historique, conservé parce qu'il explique la procédure.** La boîte
n'existait pas (constaté le 2026-09-12 : rebond *Recipient not found* sur le
premier envoi réel). Ce n'était pas un détail de configuration, l'adresse est
**publiée** :

| Où | Conséquence tant qu'elle n'existe pas |
|---|---|
| `src/_data/site.json` → `contact.email` | affichée sur `/contact/` |
| `src/cgv.njk` | mentionnée dans les CGV — engagement contractuel |
| `EMAIL_REPLY_TO` (`wrangler.toml`) | **un client qui répond à sa confirmation de commande reçoit un rebond** |
| `EMAIL_MERCHANT` | la moitié des avis de commande n'arrive pas |

Le plus grave est le `reply-to` : il est silencieux côté boutique. Le MX du
domaine (`mail-fr.securemail.pro`) fonctionne, il ne manque que la boîte —
c'est une manipulation chez l'hébergeur de la messagerie, pas chez Resend ni
chez Cloudflare.

**Ne pas « corriger » en retirant l'adresse** de `wrangler.toml` : elle
resterait fausse dans les CGV et sur la page contact. La seule bonne
correction est de créer la boîte.

**Le jour où la boîte est créée — procédure, dans cet ordre :**

1. **Créer `contact@maisoncbdvape.fr`** chez l'hébergeur de la messagerie du
   domaine (celui qui porte le MX `mail-fr.securemail.pro`). Ni Resend ni
   Cloudflare n'interviennent.
2. **Vérifier qu'elle reçoit**, depuis une adresse externe quelconque. Tant
   que ce point n'est pas acquis, inutile de continuer.
3. ⚠ **Retirer l'adresse de la liste de suppression Resend.** C'est l'étape
   qu'on oublie, et elle est invisible : sur rebond définitif, Resend inscrit
   l'adresse en *Suppressed* et refuse ensuite d'y écrire **même quand la
   boîte existe**. Tout semble correct par ailleurs — domaine vérifié, clé
   valide, envoi accepté — et rien n'arrive. `resend.com/emails` → bouton
   **Suppressions** → supprimer l'entrée.
4. **Rejouer l'e-mail de test** depuis `/admin/diagnostic/`, puis ouvrir le
   journal Resend : les **deux** destinataires doivent afficher *Delivered*.
   « Accepté » ne suffit pas — voir plus bas pourquoi.
5. **Passer une commande de test en retrait boutique** et vérifier que
   `/admin/commandes/` n'affiche aucun marqueur `✉ non envoyé`.
6. **Répondre à l'e-mail de confirmation reçu côté client** : c'est le seul
   contrôle du `reply-to`, et c'est le défaut le plus silencieux des quatre.

Rien de tout cela ne demande de toucher au dépôt : le code est juste, seule la
boîte manquait.

### Monetico — la banque a validé le 2026-08-22, procédure de mise en service

Le contrat est ouvert. Il reste à saisir trois valeurs, **et elles ne vivent
pas au même endroit** — c'est le piège, parce que rien ne le signale :

| Valeur | Où la saisir | Pourquoi là |
|---|---|---|
| `MONETICO_TPE` | `wrangler.toml`, `[vars]` | projet en configuration par fichier |
| `MONETICO_SOCIETE` | `wrangler.toml`, `[vars]` | idem |
| `MONETICO_CLE_MAC` | Cloudflare → Settings → Variables, type **Secret** | 40 car. hex, jamais dans le dépôt |

Le tableau de bord Cloudflare est en **lecture seule** sur les variables non
chiffrées (« managed through `wrangler.toml` ») et n'en avertit pas : les saisir
dans l'interface donne l'illusion d'avoir agi. Seule la clé MAC, étant un
secret, s'y modifie réellement.

⚠ **Cette bannière va et vient sans que rien n'ait changé.** Le 2026-09-12
elle avait disparu de l'écran des variables, alors que le commerçant n'y avait
rien touché — de quoi croire que le projet était repassé en configuration par
l'interface et que `wrangler.toml` n'était plus appliqué. C'était faux, et
chercher de ce côté-là a coûté du temps.

Ne pas déduire l'état de la configuration d'un élément d'interface. La
question se tranche en une commande, en demandant au serveur déployé ce qu'il
utilise — `SITE_URL` est observable parce que `functions/api/auth/login.js`
la recopie dans le `redirect_uri` qu'il envoie à GitHub :

```bash
curl -sS -o /dev/null -D - \
  "https://maisoncbdvape.fr/api/auth/login?mode=admin&return=/admin/" \
  | grep -i '^location:'
```

Le `redirect_uri` doit contenir `maisoncbdvape.fr`. S'il contient
`pages.dev`, alors seulement `wrangler.toml` a cessé d'être appliqué.
`/admin/diagnostic/` répond à la même question pour toutes les variables à la
fois, et sans terminal.

**Côté banque, une seule ligne à renseigner** — l'URL de notification serveur à
serveur, qui seule fait foi pour valider un paiement (le retour navigateur ne
prouve rien, le client peut fermer son onglet) :

```
https://maisoncbdvape.fr/api/monetico-notification
```

⚠ **Un HTTP 200 ne suffit pas : c'est le CORPS qui est contrôlé.** Monetico
attend `version=2` / `cdr=0`. Jusqu'au 2026-09-18, un **GET** sur cette URL
renvoyait « Monetico notification endpoint » avec un code 200 — donc une
adresse joignable et un accusé absent. Un outil de validation ne peut que
conclure à une notification de retour défaillante tout en constatant un code
correct, ce qui se raconte naturellement comme « erreur 200 ». Le handler GET
répond désormais l'accusé, comme le POST.

⚠ **Et un sceau systématiquement refusé donne exactement le même symptôme
côté banque.** `verifyRetourMac` renvoie `false` si `MONETICO_CLE_MAC` est
absente ou tronquée ; le code répond alors `cdr=1` à *chaque* notification.
Vue de la banque, la notification « échoue » — sans qu'aucune trace ne dise
pourquoi.

### ✅ La vraie cause : deux méthodes de scellement au retour

**Ce TPE répond selon l'ancienne interface (version 3.0), pas la v2.0.** Le
journal l'a établi le 2026-09-19 : les champs reçus sont `veres`, `pares`,
`status3ds`, `cvx`, `vld`, `bincb`, `hpancb`, `originecb`, `originetr` — ceux
de l'ancienne interface — et le champ `authentification` de la v2 est absent.
C'est cohérent : notre formulaire aller porte `version = "3.0"`
(`MONETICO_VERSION`), et **le retour suit la version de l'aller**.

Les deux méthodes n'ont rien à voir :

| | v2.0 (février 2025) | **v3.0 (la nôtre)** |
|---|---|---|
| Champs | **tous** ceux postés | une **liste fixe** |
| Forme | `nom=valeur`, tri alphabétique | valeurs seules, **ordre imposé** |
| Fin | rien | **étoile finale** |
| Champ en trop | change la chaîne | ignoré |

Nous n'appliquions que l'alphabétique. Or la plateforme poste des champs
absents de la liste fixe — `modepaiement` notamment — et chacun suffisait à
faire diverger la chaîne. D'où un sceau refusé sur **chaque** notification,
avec une clé pourtant bonne.

La chaîne 3.0, telle que publiée (doc technique CM-CIC v3.0a, § 1.3.3.2) :

```
<TPE>*<date>*<montant>*<reference>*<texte-libre>*3.0*<coderetour>*<cvx>*<vld>
*<brand>*<status3ds>*<numauto>*<motifrefus>*<originecb>*<bincb>*<hpancb>
*<ipclient>*<originetr>*<veres>*<pares>*
```

⚠ **Un champ absent laisse une place vide, il ne disparaît pas** : deux
étoiles consécutives là où `motifrefus` manque. Et l'**étoile finale** fait
partie de la chaîne.

`verifierNotification()` essaie les deux méthodes et journalise celle qui a
fonctionné (`variante` = lecture du corps + méthode, ex. `standard/v3.0`).
**Garder les deux** : la documentation v2.0 § 1.4.3 l'impose explicitement —
les paiements fractionnés peuvent faire revenir une échéance scellée à
l'ancienne des jours plus tard.

`npm run test:sceau` compare la chaîne produite à **l'exemple publié dans la
documentation**, caractère pour caractère. C'est plus solide que de vérifier
un sceau : l'exemple officiel donne la chaîne, pas la clé qui l'a scellée.

✅ **Confirmé en production le 2026-09-19 à 16:26** : première notification
acceptée, `cdr=0`, `code-retour: payetest`. Deux jours de blocage, une seule
ligne de cause.

⚠ **Si le sceau se remet à échouer un jour, lire d'abord la `variante`** du
dernier appel validé dans le journal. Elle nomme la lecture du corps ET la
méthode de scellement qui fonctionnaient jusque-là ; un changement de valeur
signe une migration côté banque, et indique laquelle des deux a changé.

**La leçon de ces deux jours** : trois hypothèses ont été fausses — URL,
décodage du corps, code société — et chacune était plausible. Ce qui a
tranché à chaque fois, ce n'est pas le raisonnement, c'est le journal : appel
reçu ou non, sceau refusé ou non, **quels champs**. La liste des champs reçus
a donné la réponse en une lecture, là où deux jours de déduction avaient
échoué. Quand un tiers refuse, faire parler ce qu'il envoie.

### ⚠ Le décodage du corps fait partie du sceau

C'est ce qui bloquait la recette, et rien ne le disait. Le 2026-09-19, le
journal a montré que Monetico nous appelait bien, et que **chaque**
notification était rejetée — clé MAC présente, de bonne longueur, et sceau
**aller** accepté par la plateforme. La clé et sa dérivation étaient donc
hors de cause : le défaut était dans la reconstruction de la chaîne retour.

Monetico signe la chaîne **avant** de l'encoder pour le transport ; nous la
reconstruisons **après** décodage. Le champ `authentification` est du base64
et contient des « + ». Dans un corps `application/x-www-form-urlencoded`, un
« + » non échappé se décode en **espace** — `request.formData()` et
`URLSearchParams` appliquent correctement la norme, et détruisent le sceau.

**Ne jamais revenir à `request.formData()` ici.** `functions/api/
monetico-notification.js` lit le corps **brut** (`request.text()`) et le
confie à `verifierNotification()` (`_shared/monetico.js`), qui essaie trois
lectures — décodage standard, pourcent-décodage seul (« + » préservé), et
aucune transformation — puis retient celle dont le sceau correspond. La
variante retenue est écrite dans le journal : si ce n'est pas `standard`,
c'est la preuve que le décodage était la cause.

Ce n'est pas un assouplissement de sécurité : les trois sont des lectures
fidèles des mêmes octets reçus, et il faut toujours la clé pour forger un
sceau. `npm run test:sceau` le vérifie explicitement — un sceau falsifié doit
rester refusé, et aucune variante ne doit alors être revendiquée.

`test:sceau` tourne dans `npm run build`. Il se suffit à lui-même : il
fabrique ses propres notifications avec une clé de test, sans rien attendre
de la banque.

⚠ **Ce que ce test ne prouve pas.** Il montre que le mécanisme fonctionne,
pas que le « + » était bien la cause en production — seul le journal le dira,
en affichant la variante retenue sur une vraie notification. S'il affiche
encore « Sceau REFUSÉ » après ce correctif, les trois lectures auront été
essayées et le décodage sera définitivement écarté : il ne restera que la
valeur de la clé ou le code société (`halldelapr_hf`).

**`/admin/diagnostic/` sépare ces deux mondes**, et c'est la seule chose qui
les sépare : `functions/api/monetico-notification.js` journalise les dix
derniers appels reçus (`mtc:journal` dans `ORDERS_KV`) avec, pour chacun, la
méthode, le `cdr` renvoyé, le `code-retour` et — sur sceau refusé — la seule
présence de la clé MAC. Jamais un champ du paiement, jamais le sceau.

- **journal vide** → la banque ne nous joint pas : l'URL enregistrée chez elle
  est fausse, ou l'appel n'arrive pas. Inutile de chercher côté sceau.
- **`sceau-invalide` avec clé absente** → saisir `MONETICO_CLE_MAC` dans
  Cloudflare, en type Secret, puis redéployer.
- **`sceau-invalide` avec clé présente** → valeur erronée, ou mauvais code
  société : essayer `halldelapr_hf` (voir plus bas).
- **`sceau-valide`** → la chaîne fonctionne ; le problème est ailleurs.

**Le portail dépend de l'offre**, et c'est la source de confusion la plus
fréquente. Il y en a quatre :

- **Monetico Online** — `monetico.com/online/fr/identification/authentification.html`
  Le portail de gestion e-commerce. **C'est là que vivent les réglages
  techniques du TPE virtuel**, donc a priori le bon.
- Monetico Commerçant — `monetico.com/fr/identification/authentification.html`
  Encaissements, remises, documents contractuels. Rien de technique.
- Monetico Online **Pro** — `monetico-online-pro.com`
- Monetico Online **Asso** — `monetico-online-asso.com`

Le nom exact de l'offre figure sur le contrat (*Starter*, *Premium*, *Pro*,
*Asso*) et tranche. Les identifiants sont ceux remis avec le contrat, pas ceux
de la banque en ligne professionnelle.

⚠ Le chemin de menu vers le champ « URL de retour » n'est pas documenté
publiquement et varie selon l'offre — options du TPE virtuel, tantôt sous
« Paramètres », tantôt sous « Configuration ». Le kit de développement le
précise : `monetico.com/fr/telechargements/Documentation-technique-MO.zip`.
Le conseiller Crédit Mutuel répond plus vite.

**Recette avant production.** Garder `MONETICO_ENV = "test"` — le formulaire
pointe alors vers `p.monetico-services.com/test/paiement.cgi` et le code retour
est `payetest`. Monetico attend **trois accusés valides** (`version=2` /
`cdr=0`) sur les **trois derniers tests**, quelle que soit leur nature, avant
d'ouvrir le contrat.

⚠ **Un abandon ne compte pas : il ne produit aucune notification.** La
documentation v2.0 § 1.4.3 est explicite — « si le client ne poursuit pas le
processus de paiement jusqu'au bout […] l'interface retour n'est pas
appelée ». Inutile donc de chercher une carte de test « abandon » : il n'y en
a pas, et quitter la page ne générera rien à valider.

Il n'existe que **deux** issues notifiées : `payetest` (accepté) et
`annulation` (**refusé** — le mot prête à confusion). La recette se joue donc
en enchaînant des paiements acceptés et refusés, **sur une commande neuve à
chaque fois** : Monetico autorise 3 tentatives pour une même référence dans un
créneau de 45 minutes et notifie chacune, ce qui brouille la lecture du
journal.

Dans la fenêtre des cartes de test (icône « test » clignotante sur la page de
paiement), **c'est la colonne résultat qui décide**, pas la marque : chaque
carte est proposée avec plusieurs issues.

✅ **Recette faite le 2026-09-19** : trois accusés valides consécutifs
(16:26 `payetest`, 16:32 et 16:35 `Annulation`), tous `cdr=0`, variante
`standard/v3.0`. Côté commandes, une **Payée** et deux **Annulées** — le
chemin d'annulation, qui n'avait jamais tourné en production, relâche bien le
stock.

✅ **Bascule en production le 2026-09-26.** La banque a confirmé l'ouverture
du contrat ; `MONETICO_ENV` vaut `"production"` dans `wrangler.toml`. Le
bouton « Payer en ligne (CB) » est donc visible du public et tout paiement
débite réellement.

### ✅ Premier paiement réel : le 2026-10-03 à 08:30

**La chaîne complète a fonctionné**, pour la première fois depuis l'ouverture
du contrat. Commande `MCV-202610030629-27ME`, 14,99 €, un pod avec saveur.

```
SCEAU VALIDÉ    cdr=0    code-retour : paiement · standard/v3.0
```

Les quatre témoins, et chacun dit quelque chose de distinct :

| Témoin | Valeur | Ce qu'il prouve |
|---|---|---|
| `code-retour` | **`paiement`** | la banque a basculé en production — ce n'est plus `payetest` |
| `cdr` | **0** | notre accusé a été accepté |
| sceau | **validé** | la clé MAC en service est la bonne |
| variante | **`standard/v3.0`** | lecture du corps et méthode de scellement inchangées depuis la recette |

⚠ **Le statut « Payée » ne prouvait rien à lui seul** : `payetest` marque une
commande payée exactement de la même façon. Seul le `code-retour` du journal
sépare les deux, et c'est pour ça qu'il est écrit.

⚠ **`standard/v3.0` est désormais la valeur de référence.** Si le sceau échoue
un jour, c'est à elle qu'il faut comparer la `variante` du dernier appel
validé : un changement signe une migration côté banque, et dit laquelle des
deux moitiés — lecture du corps, ou méthode de scellement — a bougé.

La commande est passée en **Payée**, l'e-mail client est arrivé, aucun marqueur
`✉ non envoyé` dans `/admin/commandes/`.

**Reste à faire :** rembourser ces 14,99 € depuis le back-office Monetico.

⚠ **Si le journal affichait encore `payetest`**, la banque n'aurait pas
basculé : il faudrait repasser `MONETICO_ENV = "test"` et pousser
immédiatement. Laisser la variable à `"production"` dans ce cas donne le pire
des deux mondes — un bouton CB visible du public, menant à une plateforme qui
n'encaisse pas. Ce n'est plus le cas, la note reste pour le jour d'un doute.

⚠ **Une clé MAC de production.** Si la banque en a remis une nouvelle avec
l'ouverture du contrat, elle doit remplacer l'ancienne dans Cloudflare
(Secret) **avant** le premier paiement réel. Sinon le sceau échoue sur chaque
notification, la commande reste impayée, et le symptôme est indiscernable
d'une URL de notification fausse.

Détail complet dans `docs/deploiement-cloudflare.md`, section 11.

**Resend est opérationnel depuis le 2026-08-22.** Le compte s'appelle
`vapelab` (connexion `contact@vapelab.fr`) — c'est un héritage de l'ancien
projet, et il héberge maintenant **deux** domaines vérifiés : `vapelab.fr` et
`maisoncbdvape.fr`. Chercher un compte « maisoncbdvape » chez Resend ne donne
rien ; c'est le piège.

⚠ **La clé d'API doit porter sur `maisoncbdvape.fr`, et sur lui seul.** Celle
en service est une clé *Sending access* restreinte à ce domaine — si elle
fuite, elle ne peut écrire depuis aucun autre. Ne jamais la remplacer par une
clé `vapelab.fr` ni par une clé d'accès complet. Détail de la panne que ce
point a causée : plus bas, section `/admin/diagnostic/`.

⚠ **Cette boutique dépend donc d'un compte au nom de l'ancien projet.** Le
site `vapelab.fr` est mis en pause à partir du 2026-09-09, et il serait
naturel de faire le ménage dans ce qui porte ce nom. **Ne pas fermer le
compte Resend, ne pas y supprimer le domaine `maisoncbdvape.fr`** : les
e-mails de commande de MaisonCBDVape cesseraient de partir, sans erreur
visible ailleurs que dans les journaux Resend. Supprimer le domaine
`vapelab.fr` de ce compte est en revanche sans effet sur nous. Renommer le
compte le jour où c'est possible lèverait l'ambiguïté.

Les enregistrements vivent sur le sous-domaine d'envoi `send.maisoncbdvape.fr`
(MX vers `feedback-smtp.eu-west-1.amazonses.com`, SPF `include:amazonses.com`),
plus le DKIM en `resend._domainkey`. **Ce découpage est ce qui évite le
conflit** : le SPF de la racine (`include:spf.webapps.net`, pour la messagerie
du commerçant chez son hébergeur) reste seul et intact. Un domaine ne peut
porter qu'un seul SPF — ne jamais en ajouter un second à la racine, ni écraser
celui qui s'y trouve.

Le MX de la racine (`mail-fr.securemail.pro`) n'a rien à voir avec Resend et ne
doit pas être touché.

⚠ **« Aucun e-mail n'est parti » n'est pas forcément une panne d'e-mail.**
Le 2026-09-12, le commerçant a passé trois commandes par carte en recette et
n'a rien reçu ; le tableau de bord Resend affichait « No sent emails yet ». La
conclusion naturelle — clé absente ou révoquée — était fausse.

Sur le parcours carte, **le seul endroit qui envoie un e-mail est
`functions/api/monetico-notification.js`**, l'appel serveur à serveur de la
banque. Tant que la banque n'a pas enregistré l'URL de notification, ce
fichier n'est jamais exécuté : aucune commande ne passe en `paid`, et aucun
e-mail n'est demandé. Zéro envoi est donc la **conséquence attendue** de
l'attente bancaire, pas un symptôme distinct. `monetico-retour-client.js`, lui,
ne fait qu'afficher une page — il n'envoie rien, et c'est voulu (le retour
navigateur ne prouve aucun paiement).

Seul le retrait en boutique (`submit-reservation.js`) envoie sans attendre la
banque. **C'est sur ce parcours-là, et lui seul, qu'une absence d'e-mail
accuse la configuration.**

Avant de suspecter une clé, se demander donc : *quel code aurait dû envoyer ?*

### `/admin/diagnostic/` — voir ce que le serveur reçoit vraiment

`functions/api/diagnostic.js` répond depuis l'intérieur du Worker : présence
de chaque variable et de chaque binding, plus un bouton qui envoie un e-mail
de test au commerçant. Il existe parce qu'une variable absente ne produit
aucune erreur — `_shared/email.js` renvoie `{ stubbed: true }` et poursuit —
et parce que le tableau de bord Cloudflare montre ce qui a été **saisi**, pas
ce que le Worker **reçoit**.

L'e-mail de test est ce qui tranche : une clé absente, une clé révoquée et une
clé sans droit sur le domaine donnent le même silence côté client, et se
corrigent à trois endroits différents. C'est lui qui a résolu la panne du
2026-09-12 en une phrase, là où deux heures de déduction avaient désigné deux
causes fausses.

⚠ **Relayer le message du fournisseur, jamais seulement le code HTTP.**
`_shared/email.js` ne remontait que « Echec envoi email : 403 ». Or un 403 de
Resend recouvre **trois** causes distinctes, qui se corrigent à trois endroits
différents :

1. le domaine d'envoi n'est pas (ou plus) vérifié ;
2. *aucun* domaine ne l'est, et Resend n'autorise alors l'envoi que vers
   l'adresse du titulaire du compte ;
3. **la clé est restreinte à un autre domaine.** Une clé Resend créée en
   « Sending access » peut être rattachée à **un seul domaine** — c'est même
   recommandé, une clé volée ne pouvant alors écrire que depuis celui-là.

Resend dit laquelle en toutes lettres dans le corps de sa réponse ; cette
phrase était jetée, et j'ai d'abord affiché ma propre interprétation du code à
sa place — laquelle désignait la cause 1, alors que le domaine était vérifié
depuis trois semaines. Elle est désormais relayée telle quelle, tronquée à 300
caractères (elle finit dans `order.emails`, en KV), et `test:diagnostic`
vérifie qu'elle apparaît bien à l'écran.

✅ **C'était la cause 3, et c'est résolu** (2026-09-12). Resend répondait, mot
pour mot : *« This API key is not authorized to send emails from
maisoncbdvape.fr »*. La clé en service venait du compte `vapelab` et avait été
créée quand `maisoncbdvape.fr` n'existait pas encore — rattachée à
`vapelab.fr`, elle ne pouvait structurellement pas écrire depuis
`noreply@maisoncbdvape.fr`. Aucune manipulation de DNS ni de vérification de
domaine n'y aurait rien changé, et c'est précisément là que les deux premières
heures sont parties.

Remplacée par une clé **Sending access restreinte à `maisoncbdvape.fr`**,
saisie dans Cloudflare en type Secret. Premier envoi réussi le jour même.

⚠ **La leçon vaut au-delà de Resend.** Une clé d'API peut être *valide*,
*acceptée*, et *sans droit sur la ressource visée* — trois états distincts
qu'un code HTTP seul ne sépare pas. À chaque fois qu'un service tiers refuse,
chercher d'abord la **portée** de la clé, pas sa validité. Et tout héritage du
projet `vapelab` est suspect par construction : ce qui a été créé avant que
`maisoncbdvape.fr` existe ne peut pas le connaître.

⚠ **« Accepté » n'est pas « remis », et c'est un angle mort qui reste
ouvert.** Resend répond 200 dès qu'il prend le message en charge ; la remise a
lieu ensuite, et peut échouer — adresse inexistante, serveur du destinataire
qui refuse — sans que rien ne revienne au Worker. Le tout premier envoi réussi,
le 2026-09-12, est passé en **Bounced** dans le journal Resend alors que
l'écran affichait « Envoyé » en vert.

L'écran dit désormais « Accepté par Resend » et renvoie explicitement au
journal ; `test:diagnostic` impose ce vocabulaire. Mais la conséquence
sérieuse est ailleurs : **`order.emails = "envoye"` signifie « accepté », pas
« reçu »**. Une commande peut donc s'afficher sans alerte alors que le client
n'a jamais rien reçu. Fermer vraiment ce trou demande de brancher les
*webhooks* Resend (`email.bounced`, `email.delivered`) sur une Pages Function
qui remonte l'état sur la commande — non fait, à faire avant de considérer la
chaîne e-mail comme fiable.

### Quel statut envoie un e-mail, et à qui

Le commerçant a demandé le 2026-10-03 s'il était normal de ne rien recevoir
après avoir passé une commande en « En préparation ». **Oui**, et le tableau
mérite d'être écrit parce qu'un assistant qui reprend le dépôt le devinera mal :

| Statut | Client | Commerçant |
|---|---|---|
| `pending` / `paid` | à la création (`submit-reservation`, `monetico-notification`) | idem |
| `preparing` | **rien** | **rien** |
| **`ready`** | **« votre commande est prête »** | rien |
| `completed` | rien | rien |
| `cancelled` | rien — mais le **stock est rendu** | rien |

**`preparing` n'envoie rien volontairement**, et ce n'est pas un oubli : la
confirmation annonce déjà « nous préparons votre commande, vous recevrez un
nouvel email dès qu'elle sera prête ». Un message « en préparation »
n'apprendrait rien au client et casserait la promesse d'un seul e-mail suivant.
**Aucun** changement de statut n'écrit au commerçant : c'est lui qui vient de
faire le geste.

⚠ **Et en vérifiant ça, un défaut silencieux est apparu.** L'envoi de
`ready` était enveloppé dans un `catch` qui ne faisait qu'un `console.error` :
**l'issue n'était écrite nulle part sur la commande**. Un échec de l'e-mail
« votre commande est prête » ne produisait donc **aucun** marqueur
`✉ non envoyé` dans `/admin/commandes/` — le commerçant croyait avoir prévenu,
le client attendait, et rien ne le disait.

C'est littéralement la panne du 2026-09-12 (« aucun e-mail n'est parti et rien
nulle part ne le dit ») reposée à un autre endroit. `submit-reservation.js`
écrivait `order.emails` avec un commentaire expliquant pourquoi ; ce chemin-ci
ne l'avait jamais fait. `update-order-status.js` l'écrit désormais sous la clé
`prete`.

⚠ **Il FUSIONNE, il n'écrase pas** : `o.emails = { ...(o.emails || {}), prete }`.
`order.emails` porte déjà l'issue des envois de la commande initiale
(`client`, `commercant`) ; un remplacement effacerait la trace d'un échec
antérieur au moment même où le commerçant passe la commande en « Prête ». **Un
journal qu'une étape suivante efface n'est pas un journal** — même règle que la
ligne de `mouvements` conservée à la suppression d'une commande.

⚠ **`{ stubbed: true }` est distingué d'un succès.** Une clé Resend absente ne
lève aucune exception : sans ce test, la seule panne qui s'est réellement
produite dans ce projet passerait pour un envoi réussi.

⚠ L'échec d'écriture du témoin, lui, est absorbé : le changement de statut est
déjà appliqué et le stock est juste. Faire échouer la requête pour un témoin
manquant laisserait le commerçant devant une erreur alors que son geste a
abouti.

✅ **L'e-mail `ready` a tourné en production le 2026-10-03** sur la commande
`MCV-202610030629-27ME`, et il est arrivé. C'était le **dernier des cinq
statuts jamais exécuté** : les cinq sont maintenant prouvés.

### ⚠ Classé indésirable chez Outlook — et l'authentification était PARFAITE

Le premier e-mail de paiement réel (2026-10-03, vers une boîte Hotmail) est
arrivé dans les indésirables. L'hypothèse naturelle — SPF, DKIM, DMARC — est
**fausse**, et les en-têtes du message reçu l'établissent sans discussion :

```
Authentication-Results: mx.microsoft.com 1;
  spf=pass (sender IP is 54.240.3.13) smtp.mailfrom=send.maisoncbdvape.fr;
  dkim=pass header.d=maisoncbdvape.fr;
  dkim=pass header.d=amazonses.com;
  dmarc=pass action=none header.from=maisoncbdvape.fr;
  compauth=pass reason=100
```

**Les cinq passent.** Il n'y a donc rien à corriger dans le DNS, et c'est
l'information la plus utile de tout cet épisode : elle ferme la piste sur
laquelle on perdrait le plus de temps. Le découpage racine / `send.` décrit
plus haut fonctionne exactement comme prévu, l'alignement DMARC compris.

La cause est deux en-têtes plus bas :

```
X-MS-Exchange-Organization-SCL: 5          ← score de spam (0–9), 5 = spam
X-Microsoft-Antispam: BCL:0                ← pas vu comme du publipostage
X-Microsoft-Antispam-Mailbox-Delivery: … dest:J … RF:JunkEmail
```

`SCL:5` avec `BCL:0` dit : **contenu et réputation, pas configuration.** Deux
facteurs, dont le poids respectif n'est pas mesurable de l'extérieur :

1. **Le domaine n'a aucun historique d'envoi.** C'était son premier message
   vers Outlook. Microsoft est le plus sévère des grands fournisseurs sur ce
   point et il n'existe aucun réglage pour l'accélérer — seulement du volume
   reçu sans plainte.
2. **Le vocabulaire du commerce** (« CBD & Vape », noms de pods). Hypothèse
   plausible, **non vérifiée** — à ne pas écrire comme un fait.

⚠ **Ne pas « corriger » le DNS pour ça.** Ajouter un second SPF, durcir DMARC
ou refaire le DKIM ne changera rien à un `SCL` de contenu, et le SPF de la
racine appartient à la messagerie du commerçant (voir plus haut) — y toucher
casserait sa boîte pour un gain nul. C'est le piège complet : un symptôme réel,
une piste plausible, et une correction qui dégrade.

**Ce qui aide réellement, par ordre d'effet décroissant :**

| Geste | Effet | Portée |
|---|---|---|
| « Ce n'est pas un courrier indésirable » dans la boîte | fort, immédiat | **cette boîte seulement** |
| Du volume reçu sans plainte, dans le temps | le vrai levier | tout Outlook |
| `rua=` dans le DMARC | aucun sur le classement | donne de la **visibilité** |
| `p=none` → `p=quarantine` | marginal | signale un domaine tenu |

Le DMARC en service est `v=DMARC1; p=none;` **sans `rua`** —
`docs/deploiement-cloudflare.md` § sur le DNS en prévoyait un. L'ajouter ne
corrigera pas l'indésirable : il fait arriver les rapports agrégés, donc la
seule mesure dont on disposera le jour d'un vrai problème d'alignement.

⚠ **Confirmé par un second message le même jour.** L'e-mail « votre commande
est prête » est arrivé lui aussi en indésirable, après les correctifs poussés
entre les deux. C'est la **prédiction qui se vérifie**, pas un échec : rien de
ce qui a été modifié ne touchait à la réputation, et deux messages ne font pas
un historique. **Ne pas en déduire qu'il faut chercher ailleurs** — c'est
exactement le moment où l'on se met à toucher au DNS par impatience.

### ✅ Et la mesure a tranché : c'est Outlook, pas la boutique

**Une boîte Hotmail n'est pas la clientèle.** Tout ce qui précède était mesuré
sur **une** adresse chez **un** fournisseur, celle du développeur — alors que
la clientèle française est massivement sur **Gmail**. On ne savait donc rien de
la délivrabilité réelle ; on savait seulement qu'Outlook est sévère.

**Test fait le 2026-10-03 : Gmail met le message en BOÎTE PRINCIPALE.** Même
domaine, même configuration, même contenu. La chaîne e-mail est donc saine, et
le classement d'Outlook est un comportement de ce fournisseur-là envers un
domaine neuf — **pas un défaut de la boutique**. Rien à corriger.

⚠ **Le bouton de `/admin/diagnostic/` ne pouvait PAS servir à ce test** : il
envoie vers `EMAIL_MERCHANT` (`wrangler.toml`), et nulle part ailleurs — l'écran
le dit en toutes lettres. Aucune des deux adresses n'est chez Gmail. La bonne
méthode est donc de **passer une commande de test en retrait boutique avec une
adresse Gmail comme adresse client** : c'est gratuit, et c'est meilleur, puisque
cela éprouve le vrai gabarit de confirmation plutôt qu'un message de service.
Supprimer la commande ensuite — le bouton rend le stock avant d'effacer.

⚠ **Un champ « envoyer à » sur l'écran de diagnostic a été envisagé et NON
retenu.** Il transformerait un bouton qui n'écrit qu'au commerçant en un envoi
vers n'importe quelle adresse depuis le domaine de la boutique. Protégé par
l'authentification admin, certes, et à contenu figé — mais c'est exactement la
capacité qui détruit une réputation d'expéditeur si une session fuite. Or la
réputation est précisément ce qui manquait ici. Ne pas l'ajouter sans une
raison plus forte que la commodité.

⚠ **La leçon de méthode, pour la sixième fois dans ce projet.** Trois jours de
Monetico, la clé Resend, le 7403 de wrangler, la CSP de Decap, le script mort
de `categorie-menu` — et maintenant ceci. À chaque fois le raisonnement a
désigné une cause plausible et fausse, et à chaque fois **ce que le tiers
envoie** a donné la réponse en une lecture. Ici : les en-têtes du message reçu.
Devant un refus extérieur, ne rien supposer et demander la trace.

⚠ **Corrigé au passage, et ce n'est PAS un correctif de délivrabilité** : la
partie `text/plain` de `paiementClient()` (`_shared/templates.js`) était
désaccentuée — « est valide », « prete a etre recuperee », « A bientot » —
seule de tout le fichier, les trois autres gabarits clients portant leurs
accents depuis toujours. Le corps est en `charset=utf-8` quoted-printable, les
accents y transitent sans dommage : il n'y avait aucune raison technique. La
partie texte est ce que montrent les clients en mode texte, les aperçus de
notification et les lecteurs d'écran — pas un repli décoratif.

⚠ **Il ne renvoie jamais la valeur d'un secret** — seulement sa présence et sa
longueur. Ne pas « juste afficher les quatre premiers caractères » : la
longueur suffit aux cas réels (une clé MAC Monetico fait 40 caractères ; 39
trahit une coupure au copier-coller).

`npm run test:diagnostic` exécute l'écran pour de vrai, dans le HTML généré,
avec un `fetch` simulé — c'est le seul contrôle du dépôt qui attrape la classe
d'erreur qui a figé `/admin/commandes/` sur « Chargement… » (voir plus bas).
Il s'auto-désactive si `linkedom` n'est pas installé plutôt que de faire
tomber une construction.

**Le domaine est en service depuis le 2026-08-22.** `maisoncbdvape.fr` et
`www.maisoncbdvape.fr` sont tous deux des domaines personnalisés du projet
Pages `FlowPesci/maisoncbdvape`, actifs, en HTTPS, servis par le proxy
Cloudflare. L'apex est le canonique — c'est lui que déclare `site.json`.

⚠ **Le bouton « Activate domain » ne suffit pas.** Il supprime l'ancien
enregistrement A puis rend la main sans écrire le CNAME : la fiche reste en
« Verifying » indéfiniment, et rien n'indique qu'il manque une étape. Il faut
ensuite ouvrir « Complete DNS setup » et cliquer « Check DNS records » — le
CNAME existe déjà à ce stade, la vérification le constate et bascule la fiche
en « Active / SSL enabled ». Les deux hôtes y sont passés.

Les enregistrements MX (`mail-fr.securemail.pro`) et le SPF n'ont pas été
touchés : la messagerie du domaine continue de fonctionner.

Reste à faire un jour : une règle de redirection `www` → apex. Les deux hôtes
servent aujourd'hui le même contenu ; les balises `canonical` pointent toutes
vers l'apex, donc le référencement est déjà consolidé, mais une redirection
serait plus propre.

**Chantier de sécurité clos : jeton d'admin + CSP script-src.** Les deux
étaient liés — un jeton lisible en `localStorage` combiné à une CSP qui
autorisait `unsafe-inline`/`unsafe-eval` voulait dire qu'une seule injection
de script suffisait à voler un jeton GitHub `repo`. Traité dans cet ordre :

1. Le jeton GitHub ne transite plus par le navigateur : `functions/api/auth/
   callback.js` pose un cookie de session `HttpOnly` (`mcv_admin_session`),
   le jeton reste dans `OAUTH_KV` (`functions/_shared/session.js`).
   `requireGithubUser` (`functions/_shared/auth.js`) le lit depuis le cookie.
   Un second cookie non-secret, `mcv_admin_hint`, sert uniquement à afficher
   le bouton de déconnexion et le raccourci back-office — jamais le jeton.
2. `script-src` a perdu `unsafe-inline` et `unsafe-eval`. Le site restant
   statique (pas de nonce possible sans serveur qui réécrit chaque réponse),
   `scripts/build-csp.mjs` empreinte au build les quelques scripts qui
   restent en ligne (portail d'âge, données de commande) et écrit la CSP
   finale dans `public/_headers`, après `eleventy`. Les gestionnaires
   `onclick="…"` sont partis vers des attributs `data-hover`/`data-focus`
   (règles `!important` dans `tailwind/input.css`, voir ce fichier) ou vers
   `src/assets/js/`. `/admin/contenu/*` garde `'unsafe-eval'` — Decap CMS
   lève une `EvalError` sans.

   ⚠ **Et le bloc permissif ne suffit pas : il faut détacher l'héritage.**
   Une requête qui correspond à plusieurs blocs de `_headers` hérite de
   **tous** leurs en-têtes, et un en-tête défini deux fois voit ses valeurs
   jointes. `/admin/contenu/` correspond à `/*` **et** à son propre bloc :
   la page recevait donc les deux politiques, et un navigateur qui en reçoit
   plusieurs les applique toutes en n'en retenant que l'intersection. La
   stricte continuait d'interdire `eval` ; l'éditeur de contenu refusait de
   démarrer, avec « Error loading the CMS configuration ». Le bloc écrit
   maintenant `! Content-Security-Policy` **avant** sa propre valeur.

   Constaté en production le 2026-09-09, pas en local : `wrangler pages dev`
   ne reproduit pas la fusion des blocs `_headers` telle que la fait le
   réseau Cloudflare. Pour vérifier ce genre de réglage, compter les en-têtes
   sur le site déployé — `curl -sSI … | grep -ci content-security-policy`
   doit renvoyer **1**, jamais 2.

   ⚠ **`connect-src` doit contenir `blob:` sur `/admin/contenu/*`.** Decap ne
   commite pas le fichier image tel quel : il en fait une URL `blob:` locale,
   la **fetch** pour la convertir en base64, puis envoie ce base64 à l'API
   GitHub (`AssetProxy.toBase64` → `uploadBlob` → `persistFiles`). Sans
   `blob:`, publier une fiche portant une image échoue sur **« TypeError:
   Failed to fetch »** — message qui accuse le réseau alors que c'est notre
   propre politique qui refuse. Constaté le 2026-09-24, après trois jours où
   le symptôme avait été pris pour une panne d'envoi d'image.

   La leçon est la même que pour Monetico : **la console nommait la directive
   en clair**. Devant un « Failed to fetch » dans le back-office, ouvrir la
   console avant toute hypothèse — le navigateur dit ce qu'il a bloqué.

   Note au passage : Decap tente aussi de charger une police depuis
   `fonts.googleapis.com`, bloquée par `style-src`. **C'est voulu** — le site
   n'envoie l'IP de personne à Google, y compris celle du commerçant. La ligne
   rouge dans la console est cosmétique et n'affecte que l'apparence de
   l'éditeur.

**Reste ouvert, en connaissance de cause :**
- `style-src` garde `unsafe-inline` : ~600 attributs `style=""` dans les
  gabarits, retirer ce point suppose de les faire passer en classes CSS —
  gros chantier visuel séparé, pas engagé.
- Decap CMS gère son propre jeton GitHub dans son `localStorage` à lui
  (`decap-cms-user`) — c'est sa bibliothèque, hors de notre contrôle sans le
  forker ou changer de backend.
- pdf.js (`/admin/reception/`) n'a pas été testé avec un vrai PDF sous la CSP
  resserrée : à confirmer au premier usage réel après déploiement.

**Quatre puffs attendent une confirmation fournisseur** sur la nature de leur
réservoir (voir la contrainte légale plus haut). Cinq des neuf appareils sont
documentés conformes par leur propre fiche technique — « Fourni : 2 flacons de
10 ml », « E-liquide : flacon remplaçable ». Les quatre autres ne disent rien :
`jnr-falcon-gem-30k`, `puff-30k-hyper-max-crown-bar-by-al-fakher`,
`starbuzz-ultra-max-25k`, `zpluse-jnr-42k`.

Le plus exposé est `puff-30k-hyper-max…`, dont la fiche technique porte
« Type : Prérempli » sans aucune mention de recharge. Si la réponse est
« réservoir scellé », passer la fiche en `actif: false` le jour même.

**Liens sociaux** du pied de page encore en `@tabacgex` — à changer quand les
comptes seront ouverts.

---

## Le blog — `/blog/`

Ouvert le 2026-09-25 pour le référencement. Le commerçant écrit ses articles
depuis `/admin/contenu/` → collection **Blog**.

**Des fichiers Markdown, rendus nativement par Eleventy** — délibérément, pour
n'ajouter aucune dépendance : pas d'analyseur de front matter, pas de moteur
Markdown tiers à maintenir.

| Élément | Rôle |
|---|---|
| `src/blog/*.md` | un fichier par article, écrit par Decap |
| `src/blog/blog.json` | applique à tous : layout, tag `article`, permalien |
| `src/_includes/layouts/article.njk` | la page d'un article |
| `src/blog.njk` | la liste, à `/blog/` |
| `.article-corps` (`input.css`) | habillage du Markdown rendu |

⚠ **`src/blog.njk` est à la racine de `src/`, pas dans `src/blog/`.** Les
fichiers de ce dossier héritent de `blog.json` : une page de liste placée là
serait devenue un article de plus, pointant vers elle-même.

⚠ **Le front matter d'`article.njk` doit rester en première ligne.** Eleventy
ne le reconnaît pas s'il est précédé de quoi que ce soit, même d'un
commentaire Nunjucks — le layout serait alors ignoré, sans erreur.

Les articles entrent dans `sitemap.xml` via `collections.article`. Sans cela,
ils existeraient sans être indexés, ce qui viderait l'opération de son sens.

**Visibilité :** lien en pied de page uniquement, décidé ainsi au départ. Un
bandeau « trois derniers articles » sur l'accueil est envisagé — la collection
`collections.article` est déjà disponible pour ça, rien à préparer d'autre.

---

## Documents de référence

- `docs/charte-fiches-produits.md` — structure, ton et interdits des 121 fiches
- `docs/deploiement-cloudflare.md` — bindings, variables, OAuth GitHub
- `docs/manuel-commercant.md` — mode d'emploi du back-office
- `docs/etude-stock-reservation.md`, `docs/etude-reception-marchandise.md`,
  `docs/etude-livraison-point-relais.md` — décisions d'architecture

---

## Manière de travailler attendue

Le commerçant n'est pas développeur. Il signale ce qu'il voit, pas ce qui
cloche : « le caddie est à gauche », « le bandeau saccade ». Charge à
l'assistant de trouver la cause.

**Mesurer avant de conclure.** Deux corrections successives du bandeau défilant
ont été fausses parce que la vitesse était calculée sur `scrollWidth` — le
contenu — alors qu'une propriété CSS en pourcentage se réfère à `offsetWidth`,
la boîte. Les deux analyses étaient cohérentes entre elles, et fausses.

**Regarder la page rendue.** Les contrôles automatiques lisent du HTML : ils ne
voient ni un élément décentré, ni une puce qui donne envie d'être cliquée. Pour
toute modification visuelle, ouvrir la page dans un navigateur avant de dire que
c'est fait.

⚠ **Et les écrans du back-office comptent comme des pages rendues.** Ils sont
hors du parcours client, donc hors de la passe visuelle habituelle — et c'est
là que les défauts survivent le plus longtemps. `/admin/commandes/` est resté
figé sur « Chargement… » parce que sa dernière ligne testait `token`, une
variable supprimée par le chantier de sécurité mais jamais nettoyée. Lire une
variable non déclarée lève une `ReferenceError` qui interrompt toute la
fonction anonyme : aucun affichage, aucun message, et l'API répondait pourtant
200 avec les données.

Aucun `verify:` ne peut attraper ça : `node --check` valide la syntaxe, et une
`ReferenceError` n'existe qu'à l'exécution. Un détecteur de variables libres
demanderait un vrai analyseur syntaxique et produirait surtout des fausses
alertes. **Le seul contrôle fiable reste d'ouvrir l'écran**, après toute
modification de `src/assets/js/admin-*.js`.

⚠ **Et ce n'est pas réservé au back-office — c'était une erreur de le croire.**
Le 2026-09-28, la même classe de défaut a vidé une page de VENTE.
`categorie-menu.js` levait `Cannot access 'brandChecks' before initialization` :
`if (wrap) updateSlider()` était écrit **avant** le `const brandChecks` que
`applyFilters()` lit. Un `const` déclaré plus bas n'est pas « pas encore
défini », il est en **zone morte temporelle**, et y accéder jette.

La fonction anonyme était donc abandonnée dès le chargement, et avec elle tout
ce qui suit — dont l'`IntersectionObserver` de fin de fichier, celui qui retire
l'opacité des cartes produits. Résultat : **le catalogue CBD affichait des
produits invisibles**, présents dans le HTML, à `opacity: 0`.

Le commerçant a signalé « ce produit n'apparaît pas dans la catégorie ». J'ai
lu le HTML servi, l'y ai trouvé, et lui ai répondu que tout allait bien — deux
fois. **C'était faux, et il avait raison.** Ce qui a tranché, c'est d'ouvrir la
page dans un navigateur et de lire `getComputedStyle` sur la carte : `opacity:
0`. Puis la console, qui nommait l'erreur en clair — comme pour la CSP de Decap
et pour Monetico.

**La leçon de méthode, pour la troisième fois** : lire le HTML généré ne prouve
rien sur ce que le visiteur voit. Entre les deux il y a le CSS et le
JavaScript, et un script mort ne produit aucune trace ailleurs que dans la
console.

`npm run test:pages` (`scripts/test-pages-client.mjs`) étend au parcours client
la technique de `test:diagnostic` : il exécute réellement les scripts d'une
page dans le HTML généré et **fait échouer la construction si l'un d'eux
lève**. Il tourne dans `npm run build`.

⚠ Il ne voit ni couleur, ni alignement, ni carte invisible — seulement un
script qui meurt. Ouvrir la page reste nécessaire.

⚠ Et il simule le navigateur au minimum : `IntersectionObserver`, `matchMedia`,
`fetch`, `localStorage`, et une `location` complétée. linkedom en fournit une
incomplète, sans `hash` — ce qui a fait accuser `tabacgex.js` à tort à
l'écriture du test. **Une dépendance absente du simulateur produit une fausse
alerte** : avant de corriger un script que ce test accuse, vérifier que l'erreur
existe aussi dans un vrai navigateur.

**Écrire un garde-fou plutôt qu'un correctif isolé** quand le défaut peut
revenir. Les quatre scripts `verify:` sont tous nés de cette règle.

---

## Supprimer une commande — et pourquoi ce n'est pas qu'un `delete`

Ajouté le 2026-09-28 pour faire le ménage des commandes de recette avant le
lancement : des dizaines de lignes, toutes à l'adresse du développeur, dans
lesquelles les vraies commandes allaient se noyer.

**Le bouton « Supprimer »** vit dans `/admin/commandes/`, au bout de chaque
ligne. Il appelle `functions/api/delete-order.js`.

⚠ **Effacer l'entrée KV ne suffit pas : il faut rendre le stock.** Une commande
« En attente » détient une réservation `active` — une unité retirée de `dispo`.
Supprimer la commande sans toucher à cette ligne laisserait **du stock bloqué
indéfiniment, sans plus aucune commande pour l'expliquer** ; et les
réservations ne se purgent qu'au fil de l'eau, à la commande suivante. Sur une
boutique sans trafic, « indéfiniment » est littéral.

Le danger était d'autant plus concret que ce ménage précède la **saisie des
stocks réels** : on aurait saisi des quantités justes sur des lignes déjà
amputées, et l'écart ne serait apparu qu'à la première vente refusée.

**L'ordre est donc imposé : rendre le stock, PUIS effacer.** Jamais l'inverse —
si la suppression passait d'abord et que la restitution échouait, plus rien ne
dirait ce qu'il fallait rendre. Le code s'arrête et laisse la commande intacte
si la restitution échoue.

`restituerCommande()` (`_shared/stock.js`) est réutilisée telle quelle : elle
fait les trois gestes exigés — `dispo + qty`, changement d'état, **et
l'insertion dans `mouvements`** — et elle est idempotente.

⚠ **La ligne de `mouvements` survit à la suppression, volontairement.** La
commande disparaît, la trace de ce qu'elle a fait au stock reste. C'est ce
journal qui permet d'expliquer un écart d'inventaire.

⚠ **La suppression elle-même est journalisée** dans `cmd:suppressions`
(`ORDERS_KV`, 200 dernières) : qui, quand, quel numéro, quel montant, quel
statut. Une suppression définitive sans trace serait le seul geste du
back-office dont on ne pourrait pas rendre compte.

**Trois freins, parce que ce bouton côtoie des commandes réelles :**

1. il est discret — le regard va sur « Détail → » ;
2. la confirmation rappelle **numéro, montant et statut** : « Supprimer cette
   commande ? » ne dit pas laquelle ;
3. l'API exige que l'appelant lui **renvoie le numéro exact** (`confirmation`).
   Un bouton mal câblé ou un double clic ne peut rien effacer. Ce n'est pas
   redondant avec la confirmation du navigateur : celle-ci vit dans une page,
   l'API se défend seule.

La correspondance `mtc:<référence>` posée par `create-payment.js` est effacée
avec la commande — elle pointerait sinon vers une clé morte, qu'une
notification Monetico tardive irait chercher.

⚠ **Ce qui n'est PAS supprimé** : les avis (`avis`), les alertes de retour en
stock (`attentes`), et le journal des mouvements. Décidé ainsi le 2026-09-28 —
le périmètre demandé était les commandes seules.
