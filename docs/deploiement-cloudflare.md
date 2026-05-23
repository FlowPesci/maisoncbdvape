# 🚀 Guide de déploiement Cloudflare Pages

Étapes à faire **dans l'ordre** pour déployer Tabac Gex sur Cloudflare Pages,
en remplacement de Netlify.

> Toutes les étapes sont **gratuites** au volume Tabac Gex.

---

## 1. Pousser le code à jour sur GitHub

Dans PowerShell, depuis le dossier du projet :

```powershell
cd "C:\Users\bad-g\OneDrive\Bureau\Pulsar Web\Tabac Gex\tabacgex-eleventy"
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
4. **Project name** : `tabacgex` (deviendra `https://tabacgex.pages.dev`)
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

Toujours dans le projet Pages → **Settings** → **Environment variables**.

Pour chacune, clique **"Add variable"**, choisis **"Plain text"** ou **"Encrypted"** selon le tableau, et coche **"Production"** + **"Preview"** :

| Variable                       | Type      | Valeur                                    |
| ------------------------------ | --------- | ----------------------------------------- |
| `SITE_URL`                     | Plain     | `https://tabacgex.pages.dev`              |
| `EMAIL_FROM`                   | Plain     | `Tabac Gex <onboarding@resend.dev>`       |
| `EMAIL_MERCHANT`               | Plain     | `leblanc.florian.8@gmail.com`             |
| `RESEND_API_KEY`               | Encrypted | (Phase 0 — Resend dashboard)              |
| `VIVA_MERCHANT_ID`             | Plain     | (Phase 0 — Viva dashboard)                |
| `VIVA_API_KEY`                 | Encrypted |                                           |
| `VIVA_SOURCE_CODE`             | Plain     |                                           |
| `VIVA_ENV`                     | Plain     | `demo`                                    |
| `VIVA_WEBHOOK_KEY`             | Encrypted |                                           |
| `GITHUB_OAUTH_CLIENT_ID`       | Plain     | (étape 7 ci-dessous)                      |
| `GITHUB_OAUTH_CLIENT_SECRET`   | Encrypted |                                           |
| `GITHUB_REPO`                  | Plain     | `FlowPesci/tabacgex`                      |

---

## 7. Créer la GitHub OAuth App (admin Decap CMS)

1. Va sur **[github.com/settings/developers](https://github.com/settings/developers)** → **OAuth Apps** → **New OAuth App**
2. Application name : `Tabac Gex Admin`
3. Homepage URL : `https://tabacgex.pages.dev`
4. Authorization callback URL : `https://tabacgex.pages.dev/api/auth/callback`
5. **Register application**
6. Sur la page de l'app : **note le Client ID**Ov23li1GlWpYhtctKhgS, puis bouton **"Generate a new client secret"** → **note le secret**616d67c24c0e9f793791d20c437f5a5ce1cd58ab
7. Renseigne ces 2 valeurs dans Cloudflare (étape 6) : `GITHUB_OAUTH_CLIENT_ID` + `GITHUB_OAUTH_CLIENT_SECRET`

---

## 8. (Si applicable) Inviter le commerçant comme collaborateur

Pour qu'il puisse modifier les produits via Decap CMS, il a besoin :
1. **Un compte GitHub** (gratuit, 5 min sur github.com/signup)
2. **D'être collaborateur** du repo `tabacgex` :
   - GitHub → repo `tabacgex` → **Settings** → **Collaborators** → **Add people**
   - Tape le username GitHub du commerçant → choisir rôle **"Write"**
   - Le commerçant accepte par email
3. Il pourra ensuite se connecter à `/admin/` via son compte GitHub.

---

## 9. Re-deploy

Dans Cloudflare → projet tabacgex → **Deployments** → **"Retry deployment"** sur le dernier build.

Cette fois le build doit réussir car les env vars sont en place.

---

## 10. Tester le site

URLs à vérifier (remplace `tabacgex.pages.dev` par ton URL si elle diffère) :

- **Site public** : `https://tabacgex.pages.dev/`
- **Catalogue** : `https://tabacgex.pages.dev/categories/cbd/`
- **Recherche** : `https://tabacgex.pages.dev/recherche/`
- **Suivi commande** : `https://tabacgex.pages.dev/suivi-commande/` (vide tant qu'aucune commande)
- **Contact** : `https://tabacgex.pages.dev/contact/`
- **Admin Decap** : `https://tabacgex.pages.dev/admin/` (login GitHub)
- **Back-office** : `https://tabacgex.pages.dev/admin/commandes/` (login GitHub)

---

## 11. Configurer le webhook Viva (quand le compte Viva est prêt)

1. Dashboard Viva Wallet → **Webhooks** → **Add**
2. URL : `https://tabacgex.pages.dev/api/viva-webhook`
3. Events : "Transaction Payment Created"
4. Récupérer la **Webhook Key** → ajouter dans Cloudflare env vars : `VIVA_WEBHOOK_KEY`

---

## 12. (Plus tard) Connecter le domaine `vapelab.fr`

Dans Cloudflare → projet tabacgex → **Custom domains** → **Set up a custom domain**.
Cloudflare te donne les DNS à configurer chez ton registrar (OVH, Gandi, etc.). HTTPS automatique.

Une fois le domaine actif, **mets à jour** :
- Cloudflare env var `SITE_URL` = `https://vapelab.fr`
- GitHub OAuth App → Homepage URL et Callback URL → `https://vapelab.fr/api/auth/callback`
- Viva Webhook → `https://vapelab.fr/api/viva-webhook`

---

## 🆘 Dépannage

**Le build échoue avec "Cannot find module @netlify/blobs"**
→ Tu as oublié de pull les derniers changements. `git pull` puis push de nouveau.

**`/admin/` affiche "Config Errors"**
→ Vérifie que le `Authorization callback URL` de la GitHub OAuth App est exact : `https://tabacgex.pages.dev/api/auth/callback`.

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

1. Va sur `https://tabacgex.pages.dev/admin/`
2. Login GitHub
3. Édite un produit → champ "Image principale" → clique le bouton image
4. Une fenêtre modale s'ouvre : **"Bibliothèque images (Cloudflare R2)"**
5. Bouton **"⬆ Uploader une image"** → choisis une photo
6. La photo s'affiche dans la grille → clique dessus → URL insérée dans Decap
7. **Save** + **Publish** → cette fois, le commit GitHub ne contient **PAS** la photo (juste la nouvelle URL R2 dans le JSON), donc le rebuild est plus court et **n'incrémente pas la limite d'images**.

### E. (Optionnel) Vérifier dans R2

Cloudflare → R2 → `tabacgex-media` → tu vois tes photos uploadées avec une clé du genre `produits/1714305600-photo.jpg`.
