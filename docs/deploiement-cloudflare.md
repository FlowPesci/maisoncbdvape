# 🚀 Guide de déploiement Cloudflare Pages

Étapes à faire **dans l'ordre** pour déployer MaisonCBDVape sur Cloudflare Pages,
en remplacement de Netlify.

> Toutes les étapes sont **gratuites** au volume MaisonCBDVape.

---

## 1. Pousser le code à jour sur GitHub

Dans PowerShell, depuis le dossier du projet :

```powershell
cd "C:\Users\bad-g\OneDrive\Bureau\Pulsar Web\MaisonCBDVape\tabacgex-eleventy"
git add .
git commit -m "Migration Cloudflare Pages : Functions + KV + OAuth GitHub"
git push
```

---

## 2. Créer un compte Cloudflare

1. Va sur **[dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)**
2. Crée un compte (gratuit, **pas de CB demandée**)
3. Confirme ton email

---

## 3. Créer les 2 namespaces KV (storage)

Dans le dashboard Cloudflare :

1. **Workers & Pages** (menu de gauche) → **KV**
2. Bouton **"Create a namespace"**
3. Nom : `tabacgex-orders` → Create
4. **"Create a namespace"** encore
5. Nom : `tabacgex-oauth` → Create
6. **Note les 2 IDs** (suite de caractères affichée à côté du nom) — ils seront utilisés à l'étape 5.

---

## 4. Créer le projet Pages depuis GitHub

1. **Workers & Pages** → bouton **"Create application"** → onglet **"Pages"**
2. **"Connect to Git"** → autorise Cloudflare à accéder à GitHub
3. Sélectionne le repo `FlowPesci/tabacgex` → **Begin setup**
4. **Project name** : `maisoncbdvape` (deviendra `https://maisoncbdvape.pages.dev`)
5. **Production branch** : `main`
6. **Build settings** :
   - Framework preset : **None** (on a déjà notre config)
   - Build command : `npm run build`
   - Build output directory : `public`
7. **Save and Deploy** (le 1er build va échouer faute d'env vars — c'est normal, on les ajoute juste après)

---

## 5. Configurer les bindings KV

1. Dans le projet Pages tabacgex → **Settings** → **Functions** → **KV namespace bindings**
2. **Add binding** :
   - Variable name : `ORDERS_KV`
   - KV namespace : `tabacgex-orders`
3. **Add binding** encore :
   - Variable name : `OAUTH_KV`
   - KV namespace : `tabacgex-oauth`

---

## 6. Configurer les variables d'environnement

⚠ **Ce projet est en configuration par fichier.** Le tableau de bord affiche
« managed through wrangler.toml » et y est en lecture seule : les variables en clair
et les bindings (KV, R2, D1) se déclarent dans `wrangler.toml` et s'appliquent au
déploiement suivant.

**Seuls les secrets** se saisissent dans l'interface, Pages → **Settings** →
**Variables and secrets**, car ils sont chiffrés et ne peuvent pas être versionnés.

| Variable                       | Type      | Valeur                                          |
| ------------------------------ | --------- | ----------------------------------------------- |
| `SITE_URL`                     | Plain     | `https://maisoncbdvape.pages.dev`               |
| `EMAIL_FROM`                   | Plain     | `MaisonCBDVape <noreply@maisoncbdvape.fr>`      |
| `EMAIL_REPLY_TO`               | Plain     | `contact@maisoncbdvape.fr`                      |
| `EMAIL_MERCHANT`               | Plain     | `contact@maisoncbdvape.fr`                      |
| `RESEND_API_KEY`               | Encrypted | (Resend dashboard)                              |
| `MONETICO_ENV`                 | Plain     | `test` puis `production`                        |
| `MONETICO_TPE`                 | Plain     | n° de TPE virtuel (7 car. alphanum.)            |
| `MONETICO_SOCIETE`             | Plain     | code société                                    |
| `MONETICO_CLE_MAC`             | Encrypted | clé de sécurité — 40 car. hexadécimaux          |
| `GITHUB_OAUTH_CLIENT_ID`       | Plain     | (étape 7 ci-dessous)                            |
| `GITHUB_OAUTH_CLIENT_SECRET`   | Encrypted |                                                 |
| `GITHUB_REPO`                  | Plain     | `FlowPesci/maisoncbdvape`                       |
| `ADMIN_GITHUB_USERS`           | Plain     | `FlowPesci`                                     |

---

## 7. Créer la GitHub OAuth App (back-office)

1. Va sur **[github.com/settings/developers](https://github.com/settings/developers)** → **OAuth Apps** → **New OAuth App**
2. Application name : `MaisonCBDVape Admin`
3. Homepage URL : `https://maisoncbdvape.fr`
4. Authorization callback URL : `https://maisoncbdvape.fr/api/auth/callback`
5. **Register application**
6. Sur la page de l'app : **note le Client ID**Ov23li1GlWpYhtctKhgS, puis bouton **"Generate a new client secret"** → **note le secret**616d67c24c0e9f793791d20c437f5a5ce1cd58ab
7. Renseigne ces 2 valeurs dans Cloudflare (étape 6) : `GITHUB_OAUTH_CLIENT_ID` + `GITHUB_OAUTH_CLIENT_SECRET`

---

## 8. (Si applicable) Inviter le commerçant comme collaborateur

Pour qu'il puisse modifier les produits via l'éditeur de contenu, il a besoin :
1. **Un compte GitHub** (gratuit, 5 min sur github.com/signup)
2. **D'être collaborateur** du repo `tabacgex` :
   - GitHub → repo `tabacgex` → **Settings** → **Collaborators** → **Add people**
   - Tape le username GitHub du commerçant → choisir rôle **"Write"**
   - Le commerçant accepte par email
3. Il pourra ensuite se connecter à `/admin/` via son compte GitHub : c'est le
   tableau de bord, d'où partent toutes les sections.

---

## 9. Re-deploy

Dans Cloudflare → projet tabacgex → **Deployments** → **"Retry deployment"** sur le dernier build.

Cette fois le build doit réussir car les env vars sont en place.

---

## 10. Tester le site

URLs à vérifier :

- **Site public** : `https://maisoncbdvape.fr/`
- **Catalogue** : `https://maisoncbdvape.fr/categories/cbd/`
- **Recherche** : `https://maisoncbdvape.fr/recherche/`
- **Suivi commande** : `https://maisoncbdvape.fr/suivi-commande/` (vide tant qu'aucune commande)
- **Contact** : `https://maisoncbdvape.fr/contact/`
- **Back-office (tableau de bord)** : `https://maisoncbdvape.fr/admin/` (login GitHub)
  - Commandes : `/admin/commandes/`
  - Stocks : `/admin/stocks/`
  - Réception de marchandise : `/admin/reception/`
  - Éditeur de contenu (Decap) : `/admin/contenu/`

---

## 11. Configurer Monetico Paiement (Crédit Mutuel)

Le contrat Monetico Paiement s'ouvre auprès de ton conseiller Crédit Mutuel.
La banque fournit trois éléments : **n° de TPE virtuel**, **code société** et
**clé de sécurité** (40 caractères hexadécimaux, dans un fichier « clé HMAC-SHA1 »).

1. Renseigner les trois valeurs, **et elles ne vivent pas au même endroit** :

   - `MONETICO_TPE` et `MONETICO_SOCIETE` → dans **`wrangler.toml`**, section
     `[vars]`, puis `git push`. Ce projet est en « configuration par fichier » :
     le tableau de bord Cloudflare affiche *« managed through wrangler.toml »*
     et refuse silencieusement toute modification des variables non chiffrées.
     Les saisir dans l'interface donne l'illusion d'avoir agi.
   - `MONETICO_CLE_MAC` → **uniquement** dans Cloudflare Pages → Settings →
     Variables and secrets, en type **Secret**. Les secrets sont chiffrés et
     sont précisément le seul type que le tableau de bord laisse modifier.
     Cette clé ne doit jamais apparaître en clair dans le dépôt.
2. Back-office Monetico → **Paramètres** → **URL de retour** :
   `https://maisoncbdvape.fr/api/monetico-notification`
   C'est la notification serveur à serveur : elle seule fait foi pour valider
   un paiement. Elle doit répondre en moins de 30 secondes.
3. Laisser `MONETICO_ENV=test` tant que la recette n'est pas validée. En test,
   le formulaire pointe vers `p.monetico-services.com/test/paiement.cgi` et le
   code-retour est `payetest` au lieu de `paiement`.
4. Effectuer les paiements de recette demandés par la banque (accepté, refusé,
   annulé), puis basculer `MONETICO_ENV=production`.

> ⚠ Monetico attend trois accusés de réception valides (`version=2` / `cdr=0`)
> sur les derniers tests avant d'activer le contrat en production.

---

## 12. Connecter le domaine `maisoncbdvape.fr`

Le domaine est enregistré chez un registrar externe (OVH, Gandi…). Deux options :
la **délégation complète à Cloudflare** (recommandée — indispensable pour gérer
les DNS emails au même endroit) ou un simple **CNAME** laissé chez le registrar.

### 12.1 — Ajouter le domaine à Cloudflare (délégation, recommandé)

1. Cloudflare → **Add a site** → saisir `maisoncbdvape.fr` → plan **Free**
2. Cloudflare scanne les DNS existants. Vérifier que rien d'important ne manque
   (notamment les MX si une messagerie est déjà en place sur le domaine).
3. Cloudflare affiche **deux nameservers** du type `xxx.ns.cloudflare.com`
4. Chez le registrar → zone DNS / serveurs de noms → remplacer les nameservers
   actuels par ceux de Cloudflare
5. Attendre la propagation (de 15 min à 24 h). Le statut passe à **Active**
   dans Cloudflare quand c'est bon.

### 12.2 — Rattacher le domaine au projet Pages

1. Cloudflare → Pages → projet `maisoncbdvape` → **Custom domains**
2. **Set up a custom domain** → `maisoncbdvape.fr` → Cloudflare crée le CNAME
3. Recommencer avec `www.maisoncbdvape.fr` (ou créer une règle de redirection
   `www` → apex)
4. Attendre que le statut passe à **Active** — le certificat HTTPS est automatique

### 12.3 — Une fois le domaine actif, et pas avant

⚠ Tant que le domaine ne répond pas, garder `SITE_URL` sur `.pages.dev` :
sinon l'OAuth GitHub de l'admin et les redirections de paiement pointent dans le vide.

- Cloudflare env var `SITE_URL` = `https://maisoncbdvape.fr` → **Re-deploy**
- GitHub OAuth App → Homepage URL = `https://maisoncbdvape.fr`
  et Callback URL = `https://maisoncbdvape.fr/api/auth/callback`
- Pousser le commit qui bascule `wrangler.toml` et `admin/config.yml`
  (`robots.txt` n'a plus à être touché : il est généré depuis `site.json`)
- Back-office Monetico → URL de retour → `https://maisoncbdvape.fr/api/monetico-notification`

### 12.4 — Vérifier le domaine dans Resend (emails transactionnels)

Sans cette étape, **aucun email de commande ne part** : Resend renvoie une 403
si le domaine du champ `EMAIL_FROM` n'est pas vérifié.

1. Resend → **Domains** → **Add Domain** → `maisoncbdvape.fr` → région `eu-west-1`
2. Resend fournit trois enregistrements. Les créer dans Cloudflare → DNS :

| Type | Nom | Valeur | Proxy |
| ---- | --- | ------ | ----- |
| TXT  | `resend._domainkey` | (clé DKIM fournie par Resend) | DNS only |
| TXT  | `send`              | `v=spf1 include:amazonses.com ~all` | DNS only |
| MX   | `send`              | `feedback-smtp.eu-west-1.amazonses.com` (priorité 10) | DNS only |

3. Ajouter aussi un DMARC (recommandé, améliore la délivrabilité) :

| Type | Nom | Valeur |
| ---- | --- | ------ |
| TXT  | `_dmarc` | `v=DMARC1; p=none; rua=mailto:contact@maisoncbdvape.fr` |

4. Resend → **Verify DNS Records** → attendre le statut **Verified**
5. Vérifier que `EMAIL_FROM` vaut bien `MaisonCBDVape <noreply@maisoncbdvape.fr>`

> Les enregistrements DKIM/SPF doivent être en **DNS only** (nuage gris), pas
> proxifiés. Un 403 Resend = domaine FROM non vérifié ; un 401 = clé API invalide.

---

## 🆘 Dépannage

**Le build échoue avec "Cannot find module @netlify/blobs"**
→ Tu as oublié de pull les derniers changements. `git pull` puis push de nouveau.

**`/admin/contenu/` affiche "Config Errors"**
→ Vérifie que le `Authorization callback URL` de la GitHub OAuth App est exact : `https://maisoncbdvape.fr/api/auth/callback`.

**`/admin/commandes/` reste sur "Connexion via GitHub" en boucle après login**
→ Ton compte GitHub n'est pas collaborateur du repo. Va dans Settings → Collaborators et ajoute-toi (auto-invite).

**Les emails ne partent pas**
→ Vérifie que `RESEND_API_KEY` est en mode **Encrypted** dans Cloudflare. Vérifie le domaine d'envoi (Resend exige soit `@resend.dev` soit un domaine vérifié).

**KV "ORDERS_KV is not defined"**
→ Le binding KV n'est pas correctement attaché. Re-vérifie l'étape 5.

---

## 13. (Phase 4 — R2) Créer le bucket R2 pour les images

Pour que les uploads d'images via Decap CMS ne déclenchent **plus de rebuilds Cloudflare** (économie de minutes de build), on stocke les images sur Cloudflare R2.

### A. Créer le bucket

1. Cloudflare → **R2 Object Storage** (menu de gauche)
2. **Create bucket**
3. Name : `tabacgex-media`
4. Location : `Automatic` ou `Europe (EUR)`
5. **Create**

### B. Lier le bucket au projet Pages

1. Cloudflare → projet `tabacgex` → **Settings** → **Functions** → **R2 bucket bindings**
2. **Add binding** :
   - Variable name : `MEDIA`
   - R2 bucket : `tabacgex-media`
3. **Save**

### C. Re-deploy

**Deployments** → **Retry deployment** sur le dernier build pour activer le binding.

### D. Tester l'upload

1. Va sur `https://maisoncbdvape.fr/admin/contenu/`
2. Login GitHub
3. Édite un produit → champ "Image principale" → clique le bouton image
4. Une fenêtre modale s'ouvre : **"Bibliothèque images (Cloudflare R2)"**
5. Bouton **"⬆ Uploader une image"** → choisis une photo
6. La photo s'affiche dans la grille → clique dessus → URL insérée dans Decap
7. **Save** + **Publish** → cette fois, le commit GitHub ne contient **PAS** la photo (juste la nouvelle URL R2 dans le JSON), donc le rebuild est plus court et **n'incrémente pas la limite d'images**.

### E. (Optionnel) Vérifier dans R2

Cloudflare → R2 → `tabacgex-media` → tu vois tes photos uploadées avec une clé du genre `produits/1714305600-photo.jpg`.

---

## Contrôle de la configuration de l'éditeur

Decap ne valide sa configuration **qu'au chargement, dans le navigateur**. Une faute
passe le build, passe le déploiement, et ne se découvre qu'en ouvrant l'admin —
remplacée par « Error loading the CMS configuration », sans plus aucun accès aux fiches
produits. C'est arrivé le 2026-07-26 avec un champ `sousCategorie` déclaré deux fois.

`npm run build` lance désormais `npm run verify:cms` avant Eleventy : deux champs de
même nom, une collection dupliquée ou un `backend.repo` manquant font échouer le build
en moins d'une seconde, avant tout déploiement.

Pour le lancer seul :

```powershell
npm run verify:cms
```
