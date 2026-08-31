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

### Tests et contrôles

```bash
npm run verify:css        # classes utilisées sans règle CSS, tailles d'icônes
npm run verify:cms        # config Decap (elle ne se valide que dans le navigateur)
npm run verify:api        # appels à des méthodes window.MCV_* inexistantes
npm run verify:redaction  # allégations interdites, champs décoratifs
npm run verify:puffs      # dispositifs à réservoir fixe (loi n° 2025-175)
npm run test:alertes / test:inventaire / test:reception / test:commandes
```

Les cinq `verify:` tournent dans `npm run build` et **font échouer la
construction**. Ce n'est pas de la rigueur gratuite : chacun est né d'un défaut
parti en production sans que rien ne le signale.

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

Le champ `liquideRemplissable` porte la réponse, en trois états : `true` (le
client remet du liquide), `false` (réservoir scellé, vente interdite), absent
ou vide (réponse du fournisseur attendue). `verify:puffs` **fait échouer la
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

**Côté banque, une seule ligne à renseigner** — l'URL de notification serveur à
serveur, qui seule fait foi pour valider un paiement (le retour navigateur ne
prouve rien, le client peut fermer son onglet) :

```
https://maisoncbdvape.fr/api/monetico-notification
```

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

Les enregistrements vivent sur le sous-domaine d'envoi `send.maisoncbdvape.fr`
(MX vers `feedback-smtp.eu-west-1.amazonses.com`, SPF `include:amazonses.com`),
plus le DKIM en `resend._domainkey`. **Ce découpage est ce qui évite le
conflit** : le SPF de la racine (`include:spf.webapps.net`, pour la messagerie
du commerçant chez son hébergeur) reste seul et intact. Un domaine ne peut
porter qu'un seul SPF — ne jamais en ajouter un second à la racine, ni écraser
celui qui s'y trouve.

Le MX de la racine (`mail-fr.securemail.pro`) n'a rien à voir avec Resend et ne
doit pas être touché.

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
   lève une `EvalError` sans, confirmé en local, pas supposé.

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

**Écrire un garde-fou plutôt qu'un correctif isolé** quand le défaut peut
revenir. Les quatre scripts `verify:` sont tous nés de cette règle.
