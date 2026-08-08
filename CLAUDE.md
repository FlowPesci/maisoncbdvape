# MaisonCBDVape — mémoire du projet

Boutique CBD / vape / puffs à Gex (01170). Eleventy 3 (ESM) + Tailwind, hébergé
sur Cloudflare Pages, logique serveur en Pages Functions.

Ce fichier existe parce qu'un assistant qui reprend ce dépôt peut lire le code
mais ne peut pas deviner **pourquoi** il est écrit ainsi. Tout ce qui suit a été
payé par un bug réel.

---

## Commandes

```bash
npm run build          # clean + css + catalog + 4 contrôles + eleventy
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
npm run test:alertes / test:inventaire / test:reception / test:commandes
```

Les quatre `verify:` tournent dans `npm run build` et **font échouer la
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

⚠ Reste un endroit non conforme : `src/categories/categorie.njk` contient des
prix CBD écrits en dur dans des tableaux Nunjucks. Ils avaient déjà divergé de
six fiches. À brancher sur `produits` un jour.

---

## Règles d'interface

**Ce qui ressemble à un choix doit en être un.** Deux occurrences en deux jours :

- un bouton « Me prévenir lors du retour en stock » qui était `disabled` et ne
  prévenait personne ;
- un champ `saveurs` rendu en puces dorées qui ressemblaient à des boutons, sans
  que rien n'écoute le clic.

`variantes` est le **seul** champ sélectionnable : grammages des fleurs, saveurs
des puffs, chacun avec son prix et sa ligne de stock.

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

---

## Ce qui reste à faire

**Saisir les stocks réels.** 163 références sont encore à leur valeur de semis
(10) dans `/admin/stocks/`. Le stock est la limite serveur d'une commande : tant
que les quantités sont fausses, le site accepte ou refuse des ventes sans
rapport avec la réalité du magasin. Pour les 19 fleurs, l'unité est le **gramme
de vrac**, pas le sachet — un bocal de 500 g se saisit `500`.

**En attente d'accès externes :** identifiants Monetico (TPE, société, clé MAC),
délégation du domaine `maisoncbdvape.fr` et vérification Resend, compte Mondial
Relay Start, contrat Colissimo Entreprise.

**Deux chantiers de sécurité ouverts**, structurels et liés :
- la CSP contient `unsafe-inline` et `unsafe-eval`, donc elle ne rattrape rien
  en cas d'injection ;
- le jeton d'administration vit dans `localStorage`, donc lisible par tout
  script s'exécutant sur le domaine — que la CSP ne bloque pas.

C'est le couple qui compte, pas chacun isolément.

**Deux références de puffs** à faire vérifier auprès des fournisseurs au regard
de la loi de février 2025 sur les dispositifs non rechargeables :
`starbuzz-ultra-max-25k` et `puff-30k-hyper-max-crown-bar-by-al-fakher`.

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
