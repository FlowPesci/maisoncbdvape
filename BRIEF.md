# 📋 BRIEF — Reprise du projet Tabac Gex

**À l'attention de Claude Cowork** — ce document contient tout ce qu'il faut savoir pour reprendre ce projet sans perte de contexte. Lis-le entièrement avant de commencer à travailler.

---

## 1. Le projet en 30 secondes

**Tabac Gex** est une boutique physique située au **48 Rue de Genève, 01170 Gex (France)**, spécialisée en **CBD, Vape, Puffs, Chicha et accessoires fumeurs**. Le site actuel `tabacgex.fr` est un simple catalogue vitrine. L'objectif est de le transformer en **véritable e-commerce premium**, moderne et facile à administrer par le propriétaire (non technique).

**Stack choisie :** Eleventy (SSG) + Tailwind CSS (CDN) + Decap CMS (flat-file) + Netlify (hébergement).

**Identité visuelle :** Dark mode chic / futuriste premium. Fond noir (`#0A0A0F`), accents néon vert (`#39FF14` pour le CBD) et néon violet (`#BF5FFF` pour la Vape). Typos : Bebas Neue (display), DM Sans (corps), Space Mono (codes/badges).

---

## 2. Le propriétaire (utilisateur de Cowork)

⚠️ **Important pour ton ton et ton mode opératoire :**

- **Niveau technique : faible.** Il ne sait pas lire un terminal d'instinct, ne sait pas ce qu'est `npm` au départ.
- **Attente : livraison clé en main.** Il veut un site qui marche, pas comprendre Eleventy en profondeur.
- **Objectif final : commercialiser le site** (déploiement réel sur le domaine `tabacgex.fr`).

**Conséquences pour toi (Cowork) :**

1. **Ne demande pas de décisions techniques** quand tu peux décider seul avec un défaut sain. Annonce ce que tu fais, fais-le, montre le résultat.
2. **Explique en français simple** ce que tu lances et pourquoi. Évite le jargon non nécessaire.
3. **Quand tu as besoin d'une action manuelle de sa part** (créer un compte Netlify, valider un email, taper un mot de passe), sois explicite : « **Étape manuelle pour toi** : va sur netlify.com, clique sur "Sign up"... »
4. **Vérifie chaque étape** : `npm install` réussi, `npm run dev` démarre, page accessible à `http://localhost:8080`. Ne passe pas à la suite tant que la précédente n'est pas validée visuellement.
5. **Ne supprime jamais de fichier sans confirmation explicite.** En cas de doute, déplace dans un dossier `_archive/` au lieu de supprimer.

---

## 3. Ce qui est DÉJÀ fait (ne refais pas — vérifie et continue)

J'ai (Claude en chat) déjà bouclé les étapes 1, 2 et 3 du plan. Voici l'état du dossier que tu vas trouver :

### Étape 1 — Environnement ✅
- `package.json` avec scripts `npm run dev`, `npm run build`, `npm run debug`
- `eleventy.config.js` (ESM, Eleventy v3) avec :
  - Pass-through copy : `src/assets/`, `admin/`, `robots.txt`, `favicon.svg`
  - 5 filtres custom : `eur` (formatage € fr-FR), `slug`, `dateFr`, `limit`, `where`, `dump`
  - 7 collections auto : `cbd`, `vape`, `puffs`, `chicha`, `accessoires`, `produitsActifs`, `bestsellers`
  - Shortcode `{% year %}` pour le footer
- `netlify.toml` (commande build, publish dir = `public/`, headers sécurité, cache assets immutable)
- `.gitignore` (node_modules, public, .env...)

### Étape 2 — Données ✅
- `src/_data/site.json` : nom, adresse, contact, horaires, social, navigation
- `src/_data/categories.json` : 5 univers avec slug, couleur, image, ordre
- `src/_data/produits.json` : **6 produits réels** au schéma riche (id, marque, prix, prixBarre, stock, statutStock, galerie[], pointsForts[], ficheTechnique{}, contenuKit[], couleurs[], tags[], note, nombreAvis, dateAjout, actif, seo{}). Ce schéma est conçu pour être mappé 1-pour-1 dans Decap CMS à l'étape 5.

### Étape 3 — Templating Nunjucks ✅
- `src/_includes/layouts/base.njk` — coque HTML5 avec slot `{{ content }}`
- `src/_includes/partials/head.njk` — Tailwind CDN + config inline + Google Fonts + JSON-LD Store schema
- `src/_includes/partials/header.njk` — glassmorphism fixe, nav dynamique sur `site.navigation`, burger mobile, badge panier
- `src/_includes/partials/footer.njk` — bandeau 18+ obligatoire (jamais le supprimer), 4 colonnes, paiements, JSON dynamique
- `src/_includes/components/product-card.njk` — **macro Nunjucks** `productCard(produit, classes)` avec logique conditionnelle complète : badges stock (En stock / Stock faible ≤5 / Rupture), badges tag prioritaire (Nouveau > Hot > Promo > CBD), prix barré, unité de prix, CTA disabled si rupture
- `src/index.njk` — landing complète qui boucle sur `categories` et `collections.bestsellers`
- `src/404.njk` — page d'erreur cohérente
- `src/assets/css/tabacgex.css` — design system extrait des maquettes (~260 lignes, classes `.glass-header`, `.product-card`, `.btn-neon-green`, `.btn-outline-violet`, `.fade-up`, `.cat-card`, `.add-cart-btn`, etc.)
- `src/assets/js/tabacgex.js` — vanilla JS : menu mobile (aria-expanded), fade-up via IntersectionObserver, header dynamique au scroll, **panier persistant en localStorage** avec délégation d'événement sur `[data-add-to-cart]`

---

## 4. Ce qu'il RESTE à faire — Plan détaillé

Avance dans l'ordre suivant. Coche au fur et à mesure dans ce document (édite-le, c'est encouragé).

### ☐ Étape 0 — Vérification environnement (10 min)

Avant tout, valide que la base fonctionne :

```bash
cd <dossier-projet>
npm install
npm run dev
```

Ouvre `http://localhost:8080` dans le navigateur et **vérifie visuellement** :
- [ ] La page d'accueil s'affiche avec le hero noir + titre néon
- [ ] Le header glassmorphism est visible et reste fixe au scroll
- [ ] Les 4 cartes "Top Ventes" s'affichent (depuis `produits.json`)
- [ ] Les 5 catégories de "Nos Univers" s'affichent (les images seront cassées tant qu'on n'a pas de visuels — c'est normal, voir étape 0bis)
- [ ] Le footer 4 colonnes affiche bien le bandeau 18+ rouge
- [ ] Le menu burger mobile fonctionne (réduis la fenêtre)
- [ ] Cliquer "Ajouter au panier" affiche "✓ Ajouté !" puis incrémente le badge panier
- [ ] Pas d'erreurs en console navigateur

**Si quelque chose ne va pas :** corrige-le AVANT d'avancer. Les bugs s'accumulent sinon.

### ☐ Étape 0bis — Images placeholders (15 min)

Le catalogue référence des images qui n'existent pas encore. Crée des placeholders pour ne pas avoir des images cassées en attendant les vraies photos du commerçant.

**Option A (rapide, recommandée) :** Génère des SVG placeholders aux couleurs du thème pour chaque produit. Crée un script `scripts/generate-placeholders.js` qui produit un SVG dégradé violet/vert avec le nom du produit en surimpression, pour chaque entrée de `produits.json` ET pour chaque catégorie de `categories.json`. Place-les dans `src/assets/img/produits/` et `src/assets/img/`.

**Option B :** Utilise des images Unsplash via URL directe (déjà fait pour 1 produit dans la maquette source).

Recommandation : **Option A** car les images sont alors locales et le site reste 100% offline-first.

### ☐ Étape 4 — Pages produits dynamiques (45 min)

**Objectif :** générer automatiquement une page HTML par produit (ex : `/produits/kit-box-gen-se-vaporesso/`, `/produits/puff-30k-hyper-max-al-fakher/`, etc.).

**Méthode Eleventy :** la pagination avec `size: 1`.

Crée `src/produits/produit-detail.njk` avec ce front-matter :

```yaml
---
layout: layouts/base.njk
pagination:
  data: produits
  size: 1
  alias: produit
permalink: "/produits/{{ produit.id }}/index.html"
eleventyComputed:
  title: "{{ produit.seo.title or produit.nom }}"
  description: "{{ produit.seo.description or produit.descriptionCourte }}"
---
```

**Source de vérité visuelle :** `docs/maquettes-source/03-produit-detail.html`. Lis ce fichier en entier avant de coder, copie sa structure HTML exactement (galerie + thumbnails + zone droite achat + sticky mobile + onglets + cross-sell), puis remplace les valeurs en dur par des `{{ produit.xxx }}` issues du JSON.

**Sections à reproduire fidèlement :**
1. Fil d'ariane dynamique (Accueil > Catégorie > Produit)
2. Galerie avec image principale + miniatures (boucle sur `produit.galerie[]`)
3. Bloc droit : marque, H1, étoiles, description, prix avec gestion `prixBarre`, badges stock + expédition, points forts (boucle sur `produit.pointsForts[]` avec icônes contextuelles)
4. Sélecteur de couleurs (boucle sur `produit.couleurs[]`)
5. Stepper quantité + 2 CTA (Ajouter panier vert, Click & Collect violet)
6. Onglets : Fiche Technique (table depuis `produit.ficheTechnique{}`), Contenu du Kit (boucle `contenuKit[]`), Avis Clients (mock pour l'instant)
7. Section "Produits associés" — boucle sur 4 autres produits de la même catégorie ou tags
8. Barre sticky mobile qui apparaît au scroll

**Test final :** ouvre `http://localhost:8080/produits/kit-box-gen-se-vaporesso/` et vérifie que ça matche la maquette `03-produit-detail.html`.

### ☐ Étape 4bis — Pages catégories (30 min)

**Objectif :** une page par catégorie (`/categories/cbd/`, `/categories/vape/`, etc.) qui liste les produits de l'univers, avec sidebar filtres + drawer mobile.

**Source de vérité visuelle :** `docs/maquettes-source/02-categorie-vape.html`.

Crée `src/categories/categorie.njk` avec pagination sur `categories` (size: 1, alias: cat) et permalink `/categories/{{ cat.slug }}/index.html`. À l'intérieur, boucle sur les produits filtrés via le filtre `where` :

```njk
{% set produitsCategorie = produits | where("categorie", cat.slug) %}
{% for produit in produitsCategorie %}
  {{ productCard(produit) }}
{% endfor %}
```

**Sidebar filtres :** d'abord en HTML statique (les filtres dynamiques arriveront à l'étape 6 en JS vanilla). Le drawer mobile s'ouvre via un bouton "Filtrer & Trier".

### ☐ Étape 5 — Decap CMS (1h)

**Objectif :** interface d'admin sur `/admin/` que le commerçant utilisera pour ajouter / modifier ses produits sans toucher au code.

**5.1 — Fichier `admin/index.html`** (ne le crée que si absent) :

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Admin Tabac Gex</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body>
  <script src="https://identity.netlify.com/v1/netlify-identity-widget.js"></script>
  <script src="https://unpkg.com/decap-cms@^3.0.0/dist/decap-cms.js"></script>
</body>
</html>
```

**5.2 — Fichier `admin/config.yml`** : c'est le cœur. Mappe **chaque champ** de `produits.json` à un widget Decap.

Backend recommandé : `git-gateway` (auth Netlify Identity, gratuit). Branch `main`. Media folder `src/assets/img/produits/`. Public folder `/assets/img/produits/`.

**Collection "produits"** de type `file` (pas `folder`) car tous les produits sont dans **un seul JSON**. Le widget approprié est `list` avec un `fields` répliquant le schéma. Champs principaux à inclure (référence : `src/_data/produits.json`) :

- `id` (string, hint: « slug-en-minuscules-avec-tirets »)
- `nom`, `marque`, `categorie` (select : cbd/vape/puffs/chicha/accessoires)
- `prix` (number, step 0.01), `prixBarre` (number, optional)
- `stock` (number), `statutStock` (select)
- `image` (image), `galerie` (list of image)
- `descriptionCourte` (string), `description` (text)
- `pointsForts` (list of string)
- `ficheTechnique` (list with subfields cle/valeur — Decap ne supporte pas les objets libres, fait une liste)
- `contenuKit` (list of string)
- `couleurs` (list with subfields nom/hex — color picker pour hex)
- `tags` (select multiple : bestseller, nouveaute, hot, promo, premium, etc.)
- `note` (number 0-5), `nombreAvis` (number)
- `dateAjout` (datetime)
- `actif` (boolean, default true)
- `seo.title`, `seo.description`

**Collection "site" et "categories"** également configurables.

**5.3 — Activer Netlify Identity** : étape manuelle pour le propriétaire.
- Aller sur le dashboard Netlify > Site > Identity > Enable
- Settings > Registration > "Invite only"
- Settings > External providers > activer Google OAuth (optionnel)
- Identity > Services > Git Gateway > Enable
- Inviter l'email du commerçant

**Test :** se connecter sur `https://<site>.netlify.app/admin/`, modifier un produit, vérifier que le commit Git est créé et que Netlify rebuild automatiquement.

### ☐ Étape 6 — Finalisations (30 min)

**6.1 — SEO :**
- Sitemap automatique : crée `src/sitemap.njk` qui boucle sur toutes les pages avec leurs URL
- Meta dynamiques sur les pages produits (déjà géré via `eleventyComputed.title`)
- Schema.org `Product` JSON-LD sur chaque page produit

**6.2 — Filtrage JS :** sur les pages catégories, ajoute du Vanilla JS qui filtre la grille produits selon les checkbox marques + tranches de prix, sans rechargement de page. Les data-attributes sur les cartes (`data-marque`, `data-prix`) suffiront.

**6.3 — Audit Lighthouse :** lance Chrome DevTools > Lighthouse en mode mobile. Objectif : 95+ partout. Si la perf est < 90, vérifie : images non optimisées, polices non préchargées, JS bloquant.

### ☐ Étape 7 — Déploiement réel (45 min)

Quand le local tourne et que toutes les étapes sont vertes :

1. **Étape manuelle :** crée un dépôt GitHub (peut être privé). Initialise git localement, push.
2. **Étape manuelle :** crée un compte Netlify, "Add new site > Import from Git", choisis le repo. Build command : `npm run build`. Publish directory : `public`.
3. Premier déploiement : note l'URL `<random-name>.netlify.app`.
4. **Étape manuelle :** connecter le domaine `tabacgex.fr`. Section Domain Settings > Add custom domain. Modifier les DNS chez le registrar pour pointer vers Netlify (4 enregistrements A ou un CNAME selon le cas).
5. Vérifier le HTTPS (auto via Let's Encrypt sous 1h).
6. Activer Netlify Forms pour la newsletter (le formulaire a déjà `data-netlify="true"` dans `index.njk`).
7. Activer Identity comme expliqué étape 5.3.

**Important :** ne touche PAS à l'achat ou au transfert du nom de domaine — c'est une action que le propriétaire doit faire lui-même avec ses identifiants.

---

## 5. Ressources et conventions

### 📁 Maquettes source de vérité
Le dossier `docs/maquettes-source/` contient les 3 fichiers HTML de référence pour le design :
- `01-landing.html` → modèle pour la home
- `02-categorie-vape.html` → modèle pour les pages catégories
- `03-produit-detail.html` → modèle pour les pages produits

**Règle d'or :** quand tu codes une page Eleventy, ouvre la maquette correspondante et **copie sa structure HTML exactement**, puis remplace les valeurs en dur par des variables Nunjucks. Ne réinvente pas le design.

### 🎨 Design tokens (déjà en place dans `tailwind.config` inline + `tabacgex.css`)
- `neon-green` `#39FF14` — accent CBD, prix, CTA principal
- `neon-violet` `#BF5FFF` — accent Vape, CTA secondaire, hover
- `neon-blue` `#00D4FF` — accent Chicha, badges promo
- `dark-bg` `#0A0A0F` — fond principal
- `dark-card` `#12121A` — fond cartes
- `dark-border` `#1E1E2E` — bordures discrètes
- `smoke` `#8A8A9A` — texte secondaire

### 📜 Mentions légales obligatoires (NE JAMAIS SUPPRIMER)
- Bandeau footer : `🔞 Vente strictement interdite aux mineurs de moins de 18 ans`. Présent sur **toutes** les pages.
- Adresse boutique : `48 Rue de Genève, 01170 Gex, France`
- Click & Collect mentionné comme alternative à la livraison

### 🛡️ Hors-périmètre — ne fais PAS ces choses
- Ne mets pas en place de paiement réel (Stripe, etc.) — le projet est statique, le panier va vers une page de "demande de devis" ou "réservation Click & Collect" pour l'instant
- Ne stocke pas de données client (RGPD)
- Ne crée pas de système d'authentification client (juste une page "compte" placeholder)

---

## 6. Méthode de travail recommandée

À chaque étape majeure :

1. **Annonce** ce que tu vas faire, en 1-2 phrases
2. **Fais-le** (crée les fichiers, lance les commandes)
3. **Teste visuellement** dans le navigateur sur localhost
4. **Coche** la case dans ce BRIEF.md (édite ce fichier)
5. **Demande validation** au propriétaire avant l'étape suivante : « Étape X terminée, voici ce qui marche maintenant : ___. Je peux passer à l'étape Y ? »

En cas de blocage technique :
- Lis le message d'erreur complet
- Vérifie si c'est un problème dépendances → `rm -rf node_modules package-lock.json && npm install`
- Vérifie la version de Node : `node --version` (doit être 20+)
- Si le bug persiste après 3 tentatives, **arrête-toi et explique** au propriétaire ce que tu as essayé.

---

## 7. Premier message à envoyer au propriétaire

Quand tu as fini de lire ce brief et que tu es prêt à démarrer, écris-lui quelque chose comme :

> Salut ! J'ai lu le brief Tabac Gex. Voici ce que je comprends :
> - Le projet est aux étapes 1, 2 et 3 terminées (config Eleventy + données + templates).
> - Je vais commencer par l'étape 0 : vérifier que `npm install` et `npm run dev` fonctionnent, puis valider visuellement la home page.
> - Ensuite : placeholders d'images, puis pages produits, puis pages catégories, puis Decap CMS, puis déploiement.
>
> Je démarre maintenant ?

Attends sa confirmation, puis enchaîne.

---

**Bon travail. — Claude (chat)**
