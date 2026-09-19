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
npm run verify:cms        # config Decap (elle ne se valide que dans le navigateur)
npm run verify:api        # appels à des méthodes window.MCV_* inexistantes
npm run verify:redaction  # allégations interdites, champs décoratifs
npm run verify:puffs      # dispositifs à réservoir fixe (loi n° 2025-175)
npm run verify:cache      # empreinte de contenu sur les scripts d'/assets/
npm run test:diagnostic   # exécute réellement l'écran /admin/diagnostic/
npm run test:sceau        # sceau retour Monetico, décodage du corps compris
npm run test:alertes / test:inventaire / test:reception / test:commandes
```

Les six `verify:` tournent dans `npm run build` et **font échouer la
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

⚠ **Créer la boîte `contact@maisoncbdvape.fr` chez l'hébergeur du domaine.**
Elle n'existe pas (constaté le 2026-09-12 : rebond *Recipient not found* sur
le premier envoi réel). Ce n'est pas un détail de configuration, l'adresse est
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
est `payetest`. Jouer les paiements demandés (accepté, refusé, annulé) ;
Monetico attend **trois accusés valides** (`version=2` / `cdr=0`) avant
d'ouvrir le contrat. Basculer sur `production` seulement ensuite — et le build
refuse cette bascule si TPE ou société est vide.

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

**Écrire un garde-fou plutôt qu'un correctif isolé** quand le défaut peut
revenir. Les quatre scripts `verify:` sont tous nés de cette règle.
