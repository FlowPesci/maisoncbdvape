# Étude — Livraison en point relais

**Date** : 25 juillet 2026
**Contexte** : MaisonCBDVape propose aujourd'hui deux modes — Click & Collect à Gex
(gratuit) et livraison à domicile Colissimo (4,90 €, offerte dès 49,90 €).
**Question** : ajouter la livraison en point relais, via Colissimo, Pickup ou Mondial Relay.

---

## 1. Périmètre retenu — décision du 25/07/2026

Quatre modes de livraison au checkout, deux transporteurs, deux widgets.

| Mode | Transporteur | Filtre | Réseau proposé au client |
| --- | --- | --- | --- |
| Click & Collect | — | — | boutique de Gex, gratuit *(existant)* |
| Domicile | Colissimo | — | France métropolitaine *(existant)* |
| Point retrait | Colissimo / Pickup | `filterRelay=1` | **tout le réseau** : bureaux de Poste, commerces Pickup, consignes, voisins-relais |
| Consigne 24h/24 | Mondial Relay | `APM` | **consignes automatiques uniquement** |

Les deux réseaux se complètent volontairement : Colissimo couvre la remise en main
propre, Mondial Relay le retrait autonome sans contrainte horaire.

### Ce que la recherche a établi

**Colissimo et Pickup sont une seule intégration.** Pickup est le réseau de points relais
de La Poste, piloté par le même widget Colissimo. Un seul contrat, un seul widget, un
paramètre pour choisir les types de points.

**Colissimo ne sait pas isoler les consignes.** Son paramètre `filterRelay` sait les
exclure (`10`), jamais les afficher seules. C'est précisément ce qui justifie d'ajouter
Mondial Relay, dont le paramètre `APM` signifie « Recherche des Lockers uniquement ».

**Aucun contrat engageant n'est nécessaire côté Mondial Relay.** L'Offre Start est sans
engagement de durée ni de volume, sans frais d'ouverture, d'abonnement ni de gestion,
avec un compte prépayé. Colissimo, en revanche, exige un contrat Entreprise **et**
l'activation de droits widget sur le compte.

## 2. Ce qui est déjà en place et joue en notre faveur

L'architecture actuelle traite le mode de livraison comme un paramètre de bout en bout :

| Élément | Fichier | État |
| --- | --- | --- |
| Sélecteur de mode (2 boutons) | `src/commande.njk` | à étendre à 3 |
| Champ transmis au serveur | `mode-livraison-hidden` | réutilisable |
| Calcul des frais | `functions/_shared/livraison.js` → `computeFraisPort(sousTotal, mode)` | **prend déjà le mode en argument** |
| Stockage commande | `functions/_shared/orders.js` → `modeLivraison` + `adresseLivraison` | à compléter |
| Validation serveur | `create-payment.js`, `submit-reservation.js` | branche déjà sur le mode |
| Affichage back-office | `src/admin/commande.njk` | à compléter |
| Emails | `functions/_shared/templates.js` | à compléter |

Le travail sur le mode lui-même est donc mécanique. **L'effort réel porte sur le
sélecteur de point relais**, qui impose un widget tiers.

---

## 3. Colissimo / Pickup

Source : *Widget Point Retrait V2 — document technique version février 2026* (La Poste).

### Fonctionnement

```
Client clique « Choisir un point relais »
        │
        ├─ 1. Notre Worker appelle ws.colissimo.fr/widget-colissimo/rest/authenticate.rest
        │      avec { apikey, partnerClientCode }  →  token valable 30 minutes
        │
        ├─ 2. Le front ouvre le widget : $('#zone').frameColissimoOpen({ token, ... })
        │
        └─ 3. Le client valide un point → callback JS avec l'objet point complet
```

### Points clés

- **L'authentification doit obligatoirement se faire côté serveur.** La documentation est
  explicite : « il ne vous sera pas possible de réaliser l'authentification côté front ».
  C'est une bonne nouvelle ici : on ajoute un endpoint Worker sur le modèle de ceux de
  Monetico, et la clé API ne quitte jamais le serveur.
- La clé API se génère depuis l'espace client **CBOX** (`colissimo.fr/entreprise`).
  Elle n'a pas de durée de vie limitée mais doit être renouvelée périodiquement.
- Le compte doit avoir **les droits widget activés**. Si les points ne s'affichent pas
  malgré une authentification réussie, c'est l'offre commerciale qu'il faut faire évoluer,
  pas le code.
- Le paramètre `filterRelay` sélectionne le type de points, et c'est lui qui rend le
  débat « Colissimo ou Pickup » sans objet :

| `filterRelay` | Points retournés |
| --- | --- |
| `0` | bureaux de Poste uniquement |
| `1` | tout : bureaux de Poste, relais commerçants Pickup, consignes, Pickme |
| `2` | Pickup uniquement |
| `3` | relais commerçants Pickup uniquement |
| `5` | bureaux de Poste + relais commerçants Pickup |
| `10` | tout sauf les consignes automatiques |

  `5` est probablement le bon réglage : bureaux de Poste et commerces, sans les consignes
  automatiques qui compliquent la remise d'un produit soumis à une limite d'âge.

### Dépendances techniques

- jQuery **≥ 3.6.0**
- Mapbox GL JS **≥ 2.3.1** + sa feuille de style
- le plugin Colissimo lui-même

### Personnalisation

Trois classes CSS sont exposées — `.couleur1` (marqueurs et bouton de sélection),
`.couleur2` (filtres), `.police`. Suffisant pour aligner le widget sur la charte dorée.

---

## 4. Mondial Relay

Source : *Widget ParcelShopPicker V4.1* (Mondial Relay, groupe InPost).
Démo : `widget.mondialrelay.com`.

### Fonctionnement

```
Client clique « Choisir un point relais »
        │
        └─ $('#zone').MR_ParcelShopPicker({ Brand: "XXXXXXXX", Target: "#hidden", ... })
                 → callback OnParcelShopSelected(data)
```

**Aucun développement côté serveur.** Le widget s'authentifie avec le seul code client
(`Brand`, 8 caractères). C'est plus simple, mais cela signifie aussi que le code client
est visible dans le source de la page — sans gravité, ce n'est pas un secret, mais à
savoir.

### Points clés

- Un code de test, `BDTEST`, permet de **maquetter immédiatement sans contrat**. Un
  bandeau d'avertissement s'affiche. C'est le principal atout : on peut valider
  l'ergonomie avant de signer.
- Cartographie **Leaflet + OpenStreetMap** par défaut, donc pas de clé tierce à obtenir.
  Google Maps reste possible avec sa propre clé.
- `Responsive` vaut **`false` par défaut** — à activer explicitement, sans quoi
  l'affichage mobile est cassé.
- `ColLivMod` filtre selon le mode contractuel (`24R` standard, `24L` XL).
- Le callback renvoie `{ ID, Nom, Adresse1, Adresse2, CP, Ville, Pays, Lat, Long,
  HoursHtmlTable, Photo }` — tout ce qu'il faut pour la commande et l'étiquette.
- Réseau annoncé : 18 000 points de proximité, dont plus de 7 000 consignes.
- Limites colis : 30 kg, L+l+H ≤ 150 cm, plus grand côté ≤ 120 cm. Sans objet pour des
  fleurs et accessoires.
- La documentation widget date de décembre 2019, mais depuis la version 4 le script
  s'auto-met à jour : « la dernière version est toujours celle utilisée ».

---

## 5. Filtrer sur les consignes uniquement

### Colissimo : impossible

Le paramètre `filterRelay` n'offre aucune valeur « consignes seules » :

| Valeur | Points retournés | Consignes seules ? |
| --- | --- | --- |
| `0` | bureaux de Poste | non |
| `1` | tout | non |
| `2` | tout Pickup (commerces **et** consignes) | non |
| `3` | relais commerçants Pickup | non |
| `5` | bureaux de Poste + commerces | non |
| `10` | tout **sauf** les consignes | non — l'inverse |
| `11` | tout sauf Pickme | non |

On peut exclure les consignes, jamais les isoler. Filtrer après coup dans le callback
n'est pas une option : le client aurait choisi son point avant d'être refusé.

### Mondial Relay : prévu nativement

L'API de recherche expose un paramètre de mode de collecte/livraison avec, entre autres :

| Valeur | Signification |
| --- | --- |
| `APM` | **Recherche des Lockers uniquement** |
| `24R` | Points Relais L (standard) — valeur par défaut |
| `24L` | Points Relais XL |
| `REL` | Points Relais proposant la collecte |
| `SMA` | Points Relais XL + L + S + C (petits colis ≤ 3 kg) |

Les expéditions issues d'une recherche `APM` s'expédient sous le mode de livraison `24R`.

**✅ Confirmé le 25/07/2026.** La documentation en ligne du widget (version 4.0.11, plus
récente que le PDF V4.1 de 2019) précise explicitement, pour le paramètre `ColLivMod` :
« Il est également possible de filtrer les Lockers (valeur "APM") ». Le repli par appel
direct à l'API depuis un Worker n'est donc pas nécessaire.

**⚠ Deux pièges relevés à l'intégration :**

1. **L'URL du script du PDF est fausse.** Le cahier des charges indique
   `/parcelshoppicker/`, la bonne URL est `/parcelshop-picker/` — avec un tiret.
   L'ancienne renvoie un 404 : jQuery se charge, le plugin ne s'enregistre pas, et le
   widget échoue sans erreur explicite.
   Vérification : `https://widget.mondialrelay.com/parcelshop-picker/version` → `4.0.11`.

2. **Compatibilité jQuery.** La documentation de migration annonce « compatible JQuery
   1.6+ et 2.+ ». Le site charge jQuery 3.7.1, imposé par Colissimo qui exige 3.6 minimum
   (lot C). En pratique le widget fonctionne sur jQuery 3, mais si un comportement
   erratique apparaît, c'est la première piste — et il faudra alors charger deux versions
   de jQuery en `noConflict`, ce qui n'est pas souhaitable.

**Paramètres utiles non documentés dans le PDF** : `Theme` (`"mondialrelay"` ou
`"inpost"`), `City`, `SearchFar` (rayon maximum), `AutoSelect` (présélection d'un point).

### Contraintes des consignes

- Poids maximum **25 kg**, développé maximal **64 × 41 × 38 cm**. Sans objet ici.
- Réseau annoncé : plus de 7 000 consignes, sur 18 000 points de proximité.
- Retrait 24h/24 et 7j/7 par code à 6 chiffres reçu par email et SMS, QR code, ou
  ouverture à distance depuis l'application.

---

## 5 bis. Conditions commerciales — Offre Start

| | |
| --- | --- |
| Engagement | **aucun**, ni durée ni volume |
| Frais d'ouverture / abonnement / gestion | **aucun** |
| Plafond | 5 000 colis par an |
| Paiement | compte prépayé rechargeable |
| Délai annoncé vers la France | **3 jours ouvrés** |

Tarifs publics hors remise volume (0 à 9 colis/mois), livraison en consigne ou Point
Relais vers la France :

| Poids | Prix HT | ≈ TTC |
| --- | --- | --- |
| jusqu'à 500 g | **3,42 €** | 4,10 € |
| jusqu'à 1 kg | 3,76 € | 4,51 € |
| jusqu'à 2 kg | 5,27 € | 6,32 € |
| jusqu'à 4 kg | 5,59 € | 6,71 € |

Remises par volume mensuel : 4 % dès 10 colis, 7 % dès 50, 9 % dès 100, 10 % dès 250.

**Lecture économique — arbitrage tranché le 25/07/2026.** Une commande de fleurs CBD
(2 à 8 g) plus l'emballage reste très en dessous de 500 g, soit **3,42 € HT** au tarif
public, avant remise volume.

| Tarif client | Encaissé HT | Marge HT par colis |
| --- | --- | --- |
| 3,90 € TTC | 3,25 € | **−0,17 €** — à perte |
| **4,50 € TTC** *(retenu)* | 3,75 € | **+0,33 €** |
| 4,90 € TTC | 4,08 € | +0,66 € |

**La consigne est facturée 4,50 €**, contre 4,90 € à domicile. Elle reste donc moins chère
que la livraison à domicile — l'argument de conversion est préservé — tout en couvrant son
coût. Les remises volume (4 % dès 10 colis par mois) améliorent la marge à mesure que le
volume monte.

Le tarif du point retrait Colissimo reste à 3,90 € **provisoirement** : le coût réel
dépend du contrat Entreprise, qui n'est pas ouvert. À réévaluer au lot C avec la grille
tarifaire réelle.

---

## 6. Contraintes propres à ce site

### 6.1 jQuery

Le site est en JavaScript natif, sans framework. **Les deux widgets exigent jQuery.**
Il faut donc le charger — mais uniquement sur `/commande/`, pas globalement, pour ne pas
dégrader le LCP des pages catalogue. À faire via un bloc conditionnel dans
`commande.njk` plutôt que dans `base.njk`.

### 6.2 Content Security Policy

`src/_headers` est aujourd'hui restrictif. Ajouts nécessaires :

**Colissimo**
```
script-src  + https://ws.colissimo.fr https://api.mapbox.com https://ajax.googleapis.com
connect-src + https://ws.colissimo.fr https://api.mapbox.com https://events.mapbox.com
style-src   + https://api.mapbox.com
worker-src  blob:          ← Mapbox GL instancie des web workers
child-src   blob:
```

**Mondial Relay**
```
script-src  + https://widget.mondialrelay.com https://ajax.googleapis.com
connect-src + https://widget.mondialrelay.com
style-src   + https://unpkg.com          ← déjà présent
```

`unpkg.com` figure déjà dans `script-src` et `style-src`, ce qui couvre Leaflet : Mondial
Relay ne demande donc presque rien. Le `worker-src blob:` de Mapbox est le piège
classique côté Colissimo — sans lui, la carte reste blanche sans erreur explicite.

### 6.3 Modèle de données

Ajouter sur la commande :

```js
pointRelais: {
  transporteur: "colissimo" | "mondial-relay",
  id:      "066974",
  nom:     "TABAC DE LA GARE",
  adresse: "12 rue de la Gare",
  cp:      "01170",
  ville:   "GEX",
}
```

Et **valider côté serveur** que ce champ est présent et cohérent quand le mode vaut
`point-relais` — au même titre que `adresseLivraison` l'est aujourd'hui pour la livraison
à domicile. Ne jamais faire confiance au front sur ce point.

### 6.4 Tarification

`computeFraisPort(sousTotal, mode)` gère déjà le mode. Il suffit d'étendre
`src/_data/site.json` :

```json
"livraison": {
  "fraisPort": 4.90,
  "seuilGratuit": 49.90,
  "pointRelais": { "fraisPort": 3.90, "seuilGratuit": 49.90 }
}
```

Le fichier `functions/_shared/livraison.js` étant généré depuis ce JSON, front et serveur
restent alignés automatiquement.

---

## 7. Trois réserves à lever avant de développer

### 7.1 Le délai annoncé sur le site devient faux

Le site annonce **48h** partout — hero, bandeau défilant, page Livraison, emails
transactionnels. Or l'Offre Start Mondial Relay annonce **3 jours ouvrés** vers la France.

Il faudra donc dissocier les deux délais dans `src/_data/site.json` :

```json
"livraison": {
  "delai": "48h",
  "pointRelais": { "fraisPort": 4.90, "seuilGratuit": 49.90, "delai": "3 jours ouvrés" }
}
```

Les templates et les emails lisant déjà `site.livraison.*` et le fichier généré
`functions/_shared/livraison.js`, la propagation sera automatique.

### 7.2 Acceptation du CBD par le transporteur

Les conditions publiques de Mondial Relay visent l'ADR, les produits salissants et ce qui
peut blesser le personnel — le CBD n'y est pas nommé. Le choix des consignes écarte le
risque du commerçant franchisé qui refuse la marchandise, mais **ne dispense pas** d'une
confirmation écrite du commercial avant de s'engager.

### 7.3 Vérification de l'âge — le point le plus sensible

La vente est réservée aux majeurs. Une consigne automatique s'ouvre avec un code à
6 chiffres reçu par email et SMS : **aucun contrôle d'identité, aucun contact humain**.
C'est le mode de livraison offrant le moins de garantie sur l'âge du destinataire, plus
encore qu'un commerce où un vendeur est présent.

Le problème n'est pas nouveau — la livraison à domicile en boîte aux lettres pose déjà la
question — mais les consignes le poussent à son maximum. À arbitrer en connaissance de
cause, éventuellement avec une case de confirmation de majorité au moment du choix de ce
mode, ce qui ne vaut pas contrôle mais documente le consentement.

## 8. Plan d'implémentation

### Lot A — Socle des modes de livraison *(aucun prérequis, réalisable immédiatement)*

Étendre `src/_data/site.json`, seule source de vérité :

```json
"livraison": {
  "domicile":    { "fraisPort": 4.90, "seuilGratuit": 49.90, "delai": "48h",
                   "transporteur": "Colissimo" },
  "pointRetrait":{ "fraisPort": 3.90, "seuilGratuit": 49.90, "delai": "48h",
                   "transporteur": "Colissimo Pickup" },
  "consigne":    { "fraisPort": 3.90, "seuilGratuit": 49.90, "delai": "3 jours ouvrés",
                   "transporteur": "Mondial Relay" }
}
```

`scripts/build-catalog-index.js` régénère `functions/_shared/livraison.js` avec un
`computeFraisPort(sousTotal, mode)` étendu aux quatre modes. `base.njk` injecte la table
complète dans `window.MCV_LIVRAISON`. Front et serveur restent alignés par construction.

Ajouter sur la commande :

```js
pointRetrait: {
  transporteur: "colissimo" | "mondial-relay",
  id: "066974", nom: "TABAC DE LA GARE",
  adresse: "12 rue de la Gare", cp: "01170", ville: "GEX",
}
```

Validation serveur obligatoire : si le mode vaut `point-retrait` ou `consigne`, ce champ
doit être présent et complet — au même titre que `adresseLivraison` aujourd'hui.

Puis : quatrième bouton dans le sélecteur de `commande.njk`, affichage back-office,
emails, page Livraison.

### Lot B — Widget Mondial Relay *(prérequis : aucun pour maquetter, code client pour produire)*

Maquette avec `BDTEST` pour lever la seule inconnue technique du dossier : le widget
accepte-t-il le filtre consignes ? Puis intégration, chargement conditionnel de jQuery
sur `/commande/` uniquement, et CSP.

### Lot C — Widget Colissimo *(prérequis : contrat Entreprise + apikey CBOX + droits widget)*

Endpoint Worker d'authentification sur le modèle de ceux de Monetico — la clé API ne
quitte jamais le serveur. Puis intégration du widget avec `filterRelay=1`, Mapbox GL, et
la CSP correspondante dont le `worker-src blob:`.

### Charge

| Lot | Charge | Bloqué par |
| --- | --- | --- |
| A — socle 4 modes | 1 j | rien |
| B — Mondial Relay consignes | 1 j | code client (gratuit, immédiat) |
| C — Colissimo Pickup | 1,5 j | **contrat Colissimo Entreprise** |
| Recette mobile des 4 parcours | 0,5 j | les deux ci-dessus |
| **Total** | **~4 j** | |
| *Si le widget MR refuse `APM` : liste maison via l'API depuis un Worker* | *+1 j* | |

---

## 9. Prérequis à obtenir

| # | Démarche | Coût | Délai | Bloque |
| --- | --- | --- | --- | --- |
| 1 | Compte pro **Mondial Relay Offre Start** → code client 8 caractères | gratuit, sans engagement | immédiat | lot B en production |
| 2 | **Contrat Colissimo Entreprise** + apikey CBOX + activation des droits widget | selon contrat | à négocier | **lot C entièrement** |
| 3 | Confirmation écrite que le CBD est admis, chez les deux transporteurs | — | quelques jours | mise en production |

Le site annonce déjà des expéditions Colissimo, mais aucune trace de contrat ou
d'identifiants Colissimo n'existe dans la configuration du projet — les étiquettes sont
vraisemblablement achetées à l'unité. **Le lot C suppose donc l'ouverture d'un vrai
contrat Entreprise**, ce qui en fait le chemin critique du dossier.

## Sources

- La Poste Colissimo — *Widget Point Retrait V2*, document technique février 2026 :
  <https://www.colissimo.entreprise.laposte.fr/en/media/249/download>
- Mondial Relay — *Widget ParcelShopPicker*, cahier des charges V4.1 :
  <https://storage.mondialrelay.fr/widget-v-411.pdf>
- Mondial Relay — démonstration en ligne : <https://widget.mondialrelay.com/>
- Mondial Relay — documentation technique et modules :
  <https://www.mondialrelay.fr/solutions-professionnels/nos-services-ecommercants/documentation-technique-modules>
- Mondial Relay — *Présentation des WebServices* V1.2, février 2022 (modes de recherche,
  dont `APM` consignes uniquement) :
  <https://storage.mondialrelay.fr/Pr%C3%A9sentation%20des%20WebServices%20V1.2-1.pdf>
- Mondial Relay — Offre Start, tarifs et conditions :
  <https://www.mondialrelay.fr/solutions-professionnels/nos-offres-ecommercants/offre-start>
- Mondial Relay — marchandises interdites :
  <https://www.mondialrelay.fr/faq/envoyer-un-colis/quelles-marchandises-ne-puis-je-pas-envoyer/>
