# Réception de marchandise — entrée de stock automatisée depuis un bon de livraison

Étude du 2026-07-26. Fait suite à `docs/etude-stock-reservation.md`, qui a mis le stock
en D1 mais laissé les **entrées** de marchandise entièrement manuelles.

---

## 1. Le besoin

Aujourd'hui, quand une commande fournisseur arrive, il faut ouvrir `/admin/stocks/`,
retrouver chaque référence et corriger le chiffre à la main. Sur un bon de livraison de
30 lignes, c'est 30 recherches et 30 saisies — et une seule erreur de frappe fait vendre
un produit qu'on n'a pas.

L'objectif : **déposer le bon de livraison, vérifier ce qui a été compris, valider.**

Contraintes posées :

- **Gratuit**, sans nouvel abonnement.
- Les documents arrivent en **PDF par e-mail** et en **PDF scanné** (image de la page).
- **Rien ne s'écrit sans validation** : l'écran propose, Pesci corrige et valide.
- Les fleurs CBD sont libellées **en grammes ou en kilos** sur le bon.

---

## 2. Le vrai problème n'est pas la lecture

C'est tentant de résumer le chantier à « faire de l'OCR ». En pratique, extraire le texte
est la partie facile et fiable. La partie qui casse, c'est **l'appariement** : le
fournisseur écrit `AMNES. HYDRO IND. 500G`, le catalogue dit `Amnésia Hydro Indoor CBD`.
Aucun rapprochement automatique ne sera parfait du premier coup.

D'où le principe qui structure toute l'architecture :

> **Le système ne devine qu'une fois. Ensuite, il se souvient.**

À la première réception, Pesci associe `AMNES. HYDRO IND. 500G` → `amnesia-hydro-indoor-cbd`.
Cette association est enregistrée. **À la deuxième livraison du même fournisseur, la ligne
est reconnue d'office**, sans IA et sans doute possible. Au bout de deux ou trois
réceptions, l'écran n'a plus rien à demander.

C'est ce qui rend le système réellement « performant » sur la durée — bien plus que le
choix du modèle de lecture.

---

## 3. Options évaluées pour la lecture

| Solution | Coût | PDF texte | PDF scanné | Dépendance |
| --- | --- | --- | --- | --- |
| **`env.AI.toMarkdown()`** (Workers AI) | gratuit | ✅ | ❌ *(extrait le texte tel quel — un scan n'en a pas)* | aucune |
| **pdf.js dans le navigateur** | gratuit | ✅ | ❌ (même limite) | aucune, tourne chez Pesci |
| **Modèle vision Workers AI** | 10 000 neurones/j offerts | ✅ | ✅ | aucune |
| Google Gemini (offre gratuite) | gratuit *aujourd'hui* | ✅ | ✅ | clé tierce, données hors UE, quotas révisables |
| Mistral OCR / AWS Textract | payant au document | ✅ | ✅ | contrat |
| Tesseract (OCR local) | gratuit | ✅ | ⚠️ médiocre sur tableaux | ~8 Mo de WASM à charger |

**Écarté : Gemini.** Gratuit à l'instant T, mais impose une clé chez un tiers, fait sortir
des documents commerciaux de l'UE, et son offre gratuite peut se refermer. Or tout le
reste du site vit déjà sur Cloudflare : ajouter une dépendance externe pour économiser
zéro euro serait un mauvais échange.

**Écarté : Tesseract.** L'OCR classique lit des mots, pas des tableaux. Il rend une bouillie
de lignes qu'il faudrait ré-analyser — c'est-à-dire refaire le travail avec un modèle.

**Retenu : Workers AI**, déjà inclus dans le compte, avec **deux chemins selon le document**.

---

## 4. Architecture retenue

```
  Bon de livraison (PDF ou photo)
              │
              ▼
   ┌──────────────────────────┐
   │  Navigateur (/admin/     │   pdf.js lit la couche texte
   │  reception/)             │
   └──────────┬───────────────┘
              │
       texte trouvé ?
        ┌─────┴─────┐
       oui          non  →  le PDF est un scan
        │                   pdf.js rend chaque page en JPEG
        ▼                            ▼
   texte brut                   images de pages
        └─────────────┬───────────────┘
                      ▼
        POST /api/reception/lire   (authentifié)
                      │
                      ▼
             Workers AI, sortie JSON imposée
        texte  → @cf/qwen/qwen3-30b-a3b-fp8
        image  → @cf/google/gemma-3-12b-it
                      │
                      ▼
        lignes { designation, quantite, unite, prixAchat }
                      │
                      ▼
        ┌─────────────────────────────────────┐
        │ Appariement, côté serveur, 3 passes │
        │  1. alias mémorisé   → certain      │
        │  2. nom + marque normalisés → sûr   │
        │  3. similarité trigrammes → à voir  │
        └─────────────────┬───────────────────┘
                          ▼
              Écran de validation
        (produit, quantité, unité — modifiables)
                          │
                          ▼
        POST /api/reception/valider
        · entrerStock(cle, +delta)   ← ajout, pas remplacement
        · mouvements   motif « reception »
        · aliases mémorisés pour la prochaine fois
```

### Pourquoi rendre les images dans le navigateur

Un Worker ne sait pas rasteriser un PDF : pas de canvas, pas de pdfium. Faire le rendu
côté navigateur résout ça sans serveur supplémentaire, et **allège la facture** : seules
les pages réellement scannées partent vers le modèle, en JPEG redimensionné, pas le PDF
entier.

### Pourquoi la sortie JSON est imposée

Workers AI accepte un `response_format` avec schéma JSON. Le modèle ne rend donc pas une
phrase à ré-analyser mais un tableau typé. C'est ce qui évite la couche fragile de parsing
de texte libre.

---

## 5. Ce que ça coûte vraiment

Tarif Workers AI : **10 000 neurones par jour offerts**, sur l'offre gratuite comme payante
(remise à zéro à 00 h 00 UTC).

| Chemin | Modèle | Neurones par page | Pages/jour dans le gratuit |
| --- | --- | --- | --- |
| PDF texte | `qwen3-30b-a3b-fp8` — 4 625/M en entrée | ~35 | **~280** |
| Page scannée | `gemma-3-12b-it` — 31 371/M en entrée | ~120 | **~80** |

Un bon de livraison fait une à trois pages. Même en scan, on tient **une trentaine de
réceptions par jour** sans jamais sortir du gratuit — sans commune mesure avec le rythme
réel d'une boutique. Et le dépassement, s'il arrivait, coûterait 0,011 $ les 1 000 neurones,
soit un dixième de centime par bon.

Le reste est déjà gratuit : D1 (5 Go, 5 M de lectures/jour), Workers, et R2 (10 Go) si on
archive les documents.

---

## 6. Les points qui doivent être irréprochables

**Une réception ajoute, elle ne remplace pas.** `ajusterStock()` fixe une valeur absolue —
correct pour un inventaire, faux pour une livraison. Il faut un `entrerStock(cle, +delta)`
qui incrémente. Sinon, deux réceptions le même jour effacent la première.

**Les kilos deviennent des grammes.** Le stock des fleurs est en grammes. Un bon qui dit
`0,5 kg` doit entrer `500`. La conversion se fait à la validation, et l'écran affiche
l'unité de destination pour que l'erreur saute aux yeux.

**Un même bon ne s'applique qu'une fois.** On enregistre une empreinte du document
(SHA-256) : redéposer le même PDF affiche « déjà traité le 12/03 » au lieu de doubler le
stock. C'est la protection la plus utile du lot, parce que c'est l'erreur la plus naturelle.

**Rien n'est appliqué en silence.** Toute ligne entre dans `mouvements` avec le motif
`reception`, l'auteur et la référence du bon. Un écart constaté trois semaines plus tard
reste explicable.

**Le doute est visible.** Trois niveaux affichés : reconnu d'office (alias), proposé
(bonne similarité), incertain (à choisir). Une ligne incertaine ne peut pas être validée
sans que Pesci ait désigné le produit — ou coché « ignorer cette ligne ».

---

## 7. Découpage

**Lot A — le socle (utile seul).**
`entrerStock()`, table `alias_fournisseur`, moteur d'appariement, écran `/admin/reception/`
avec **saisie manuelle assistée** : on tape trois lettres, on choisit le produit, on entre
la quantité. Sans aucune IA, c'est déjà dix fois plus rapide que l'écran d'inventaire
actuel, et ça rend l'apprentissage des alias opérationnel.

**Lot B — lecture des PDF texte.**
pdf.js + `qwen3-30b-a3b-fp8`. Couvre la majorité des fournisseurs qui envoient par e-mail.

**Lot C — lecture des scans.**
Rendu des pages en image + `gemma-3-12b-it`. Couvre le reste, y compris une photo prise
au téléphone.

**Lot D — confort.**
Archivage du bon dans R2, historique des réceptions, et export du journal `mouvements`.

Les lots B et C se branchent sur l'écran du lot A sans le modifier : la lecture ne fait que
**pré-remplir** un formulaire qui existe déjà et qui fonctionne sans elle. Si un jour un
modèle disparaît ou déçoit, la saisie manuelle reste debout.

---

## 8. Limites connues

- **Aucun produit n'a de code EAN ni de référence fournisseur** dans le catalogue.
  L'appariement repose donc sur le libellé. Ajouter un champ `refFournisseur` dans le CMS
  rendrait la reconnaissance exacte au lieu d'approchée — à faire au fil de l'eau, chaque
  alias mémorisé apportant déjà le même bénéfice.
- Un bon manuscrit ne sera pas lu correctement. C'est une limite du procédé, pas du modèle.
- La lecture ne contrôle pas la **conformité** de la livraison : elle lit ce qui est écrit
  sur le bon, pas ce qu'il y a dans le carton. Le comptage physique reste humain.

---

## 9. Mise en service

Le code est livré. Trois étapes, dans cet ordre.

### 1 — Créer les deux tables

```powershell
npm run db:migrate:reception
```

Crée `alias_fournisseur` (la mémoire des libellés) et `receptions` (les documents
déjà traités). Rejouable sans risque : tout est en `CREATE TABLE IF NOT EXISTS`.

### 2 — Déployer

Le binding Workers AI est déjà déclaré dans `wrangler.toml` :

```toml
[ai]
binding = "AI"
```

**Aucune ressource à créer, aucune clé à saisir** — le binding suffit, et ce projet Pages
lit sa configuration depuis le fichier. Un `git push` et c'est actif.

### 3 — Essayer

`/admin/reception/` — déposer un vrai bon de livraison.

- Les lignes **reconnues** (vert) viennent d'un alias déjà validé.
- Les lignes **proposées** (orange) sont à confirmer d'un coup d'œil.
- Les lignes **à vérifier** (rouge) attendent que tu désignes le produit.

Le bouton ne valide que si chaque ligne active a un produit et une quantité. Ce qui
n'est pas de la marchandise (frais de port, ligne en double) se met de côté avec
« Ignorer ».

**Le deuxième bon du même fournisseur demandera beaucoup moins.** C'est le comportement
attendu : chaque validation enrichit la mémoire des libellés.

## 10. Vérifications

```powershell
npm run test:reception   # entrées cumulatives, doublons, kg→g, mémoire des alias
```

Puis, après une vraie réception :

```powershell
npx wrangler d1 execute maisoncbdvape-stocks --remote --command "SELECT * FROM mouvements WHERE motif='reception' ORDER BY id DESC LIMIT 10"
npx wrangler d1 execute maisoncbdvape-stocks --remote --command "SELECT libelle, cle, vus FROM alias_fournisseur ORDER BY vus DESC"
```

## 11. Ce que le code garantit

| Situation | Comportement |
| --- | --- |
| Deux livraisons le même jour | s'ajoutent, la seconde n'écrase pas la première |
| Même bon redéposé | refusé, avec la date du premier traitement |
| Bon en PDF texte | lu sans image, pour trois fois moins cher |
| Bon scanné ou photographié | pages rendues en JPEG puis lues |
| Produit absent de la base de stock | la ligne est créée à la volée, la marchandise n'est pas perdue |
| Libellé jamais vu | proposé avec ses cinq meilleurs candidats, jamais appliqué seul |
| Libellé déjà validé | reconnu sans appel au modèle |
| Poids annoncé sur un produit à l'unité | signalé, pas converti au hasard |
| Binding AI absent | la saisie manuelle continue de fonctionner |
| Quantité aberrante (> 1 000 000) | refusée côté serveur |
