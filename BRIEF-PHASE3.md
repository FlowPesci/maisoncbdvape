# 📋 BRIEF — Phase 3 : Migration Cloudflare Pages

**Date** : 2026-04-28
**Statut** : en cours
**Périmètre** : sortie de Netlify (limites de build atteintes), bascule vers Cloudflare Pages.

> Le site `tabacgex.netlify.app` a saturé le plan gratuit Netlify (300 min build/mois).
> Cloudflare Pages offre **500 builds/mois + bande passante illimitée + Workers/KV gratuits**
> à un volume largement supérieur à ce qui est nécessaire. Migration estimée 4-6 h.

---

## 1. Architecture cible

```
                                                          ┌────────────────┐
[Site statique] ──────────►                              │ Cloudflare     │
   (Eleventy)                                             │ Pages          │
                                                          │   ↪ static     │
                                                          │   ↪ functions/ │
                                                          └───────┬────────┘
                                                                  │
                            ┌─────────────────────────────────────┼─────────────────┐
                            ▼                                     ▼                 ▼
                    [Cloudflare KV "ORDERS"]            [Cloudflare KV    [Resend API]
                       (commandes JSON)                  "OAUTH_STATE"]    (emails)
                                                         (auth Decap)
                            ▲
                            │
                    ┌───────┴────────┐
                    │  Pages Functions│
                    │   /api/*        │
                    │                 │
                    │ - submit-resa   │
                    │ - create-pay    │
                    │ - viva-callback │
                    │ - viva-webhook  │
                    │ - track-order   │
                    │ - list-orders   │
                    │ - get-order     │
                    │ - update-status │
                    │ - contact       │
                    │ - auth/...      │ ← OAuth proxy GitHub pour Decap
                    └─────────────────┘
                            ▲
                            │
                    [Viva Wallet API]
```

---

## 2. Mapping Netlify → Cloudflare

| Avant (Netlify)              | Après (Cloudflare)                           |
| ---------------------------- | -------------------------------------------- |
| Netlify Pages                | Cloudflare Pages                             |
| Netlify Functions (Node)     | Pages Functions (Workers, Web standards API) |
| Netlify Blobs                | Cloudflare KV (Workers KV)                   |
| Netlify Identity + Git Gateway | OAuth GitHub direct (Decap backend `github`) |
| Netlify Forms                | Pages Function `/api/contact` + Resend       |
| `netlify.toml`               | `wrangler.toml` + `_routes.json`             |

### Différences clés API Functions

**Netlify Functions** :
```js
export const handler = async (event) => {
  const body = JSON.parse(event.body);
  return { statusCode: 200, body: JSON.stringify(data) };
};
```

**Cloudflare Pages Functions** :
```js
export async function onRequest(context) {
  const { request, env } = context;
  const body = await request.json();
  return new Response(JSON.stringify(data), { status: 200 });
}
```

L'API est plus standard (Web Fetch). Pas plus complexe, juste différent.

### Différences storage

**Netlify Blobs** :
```js
import { getStore } from "@netlify/blobs";
const store = getStore("orders");
await store.setJSON(key, value);
const data = await store.get(key, { type: "json" });
```

**Cloudflare KV** :
```js
// env.ORDERS_KV est un binding défini dans wrangler.toml
await env.ORDERS_KV.put(key, JSON.stringify(value));
const raw = await env.ORDERS_KV.get(key);
const data = JSON.parse(raw);
```

---

## 3. Variables d'environnement Cloudflare Pages

À configurer dans **Cloudflare → Pages → Project → Settings → Environment variables** :

| Clé                         | Type      | Valeur                                           |
| --------------------------- | --------- | ------------------------------------------------ |
| `VIVA_MERCHANT_ID`          | Plain     | (sandbox d'abord)                                |
| `VIVA_API_KEY`              | Encrypted |                                                  |
| `VIVA_SOURCE_CODE`          | Plain     |                                                  |
| `VIVA_ENV`                  | Plain     | `demo` ou `live`                                 |
| `VIVA_WEBHOOK_KEY`          | Encrypted |                                                  |
| `RESEND_API_KEY`            | Encrypted |                                                  |
| `EMAIL_FROM`                | Plain     | `Tabac Gex <onboarding@resend.dev>`              |
| `EMAIL_MERCHANT`            | Plain     | `leblanc.florian.8@gmail.com`                    |
| `SITE_URL`                  | Plain     | `https://tabacgex.pages.dev`                     |
| `GITHUB_OAUTH_CLIENT_ID`    | Plain     | (créé sur github.com/settings/developers)        |
| `GITHUB_OAUTH_CLIENT_SECRET`| Encrypted |                                                  |

### KV namespaces à créer dans Cloudflare :

| Nom         | Binding      | Usage                                    |
| ----------- | ------------ | ---------------------------------------- |
| `tabacgex-orders`  | `ORDERS_KV`  | Commandes (clé = orderId)                 |
| `tabacgex-oauth`   | `OAUTH_KV`   | États OAuth temporaires (TTL 10 min)      |

---

## 4. Auth Decap CMS — Nouveau flow

### Avant (Netlify Identity + git-gateway)
- Le commerçant reçoit un email d'invitation
- Il choisit un mot de passe
- Il se connecte à `/admin/`
- Decap utilise git-gateway pour parler à GitHub

### Après (GitHub OAuth direct)
- Le commerçant a un **compte GitHub** (gratuit, 5 min à créer)
- Le compte GitHub doit avoir accès au repo `tabacgex` (collaborateur)
- Sur `/admin/` : clic "Login with GitHub" → OAuth flow → Decap commit directement sur GitHub
- L'OAuth proxy (Cloudflare Worker) gère l'échange `code → access_token`

### Création de la GitHub OAuth App (étape manuelle)
1. github.com → Settings → Developer settings → **OAuth Apps** → **New OAuth App**
2. Application name : `Tabac Gex Admin`
3. Homepage URL : `https://tabacgex.pages.dev`
4. Authorization callback URL : `https://tabacgex.pages.dev/api/auth/callback`
5. Récupérer **Client ID** + **Client Secret** → mettre dans env vars Cloudflare

### Inviter le commerçant (étape manuelle)
1. github.com → repo `tabacgex` → Settings → Collaborators → **Add people**
2. Ajouter le compte GitHub du commerçant avec rôle "Write"
3. Le commerçant accepte l'invitation par email
4. Il peut alors se connecter à `/admin/` via GitHub

---

## 5. Phases de livraison

### ☐ Phase 3.0 — Documentation (ce fichier)

### ☐ Phase 3.1 — Convertir les Functions
Toutes les fonctions `netlify/functions/*.js` deviennent `functions/api/*.js` (convention Cloudflare Pages : tout fichier dans `functions/api/foo.js` est exposé à `/api/foo`).

### ☐ Phase 3.2 — Migrer Blobs → KV
Réécrire `_shared/orders.js` pour utiliser l'API KV. Adapter tous les appels.

### ☐ Phase 3.3 — Auth GitHub
Worker OAuth proxy en `/api/auth/[[path]].js`. Nouveau `admin/config.yml` avec `backend: github`.

### ☐ Phase 3.4 — Formulaire contact
`/api/contact` qui reçoit le POST, anti-spam honeypot, envoi via Resend.

### ☐ Phase 3.5 — Config build
`wrangler.toml` (KV bindings), `_routes.json` (quelles routes vont aux Functions), suppression `netlify.toml`.

### ☐ Phase 3.6 — Déploiement
Étapes manuelles côté utilisateur :
1. Créer compte Cloudflare
2. Connecter le repo GitHub
3. Configurer build : command `npm run build`, output `public/`
4. Créer les 2 KV namespaces
5. Configurer les bindings KV dans Pages → Settings → Functions → KV bindings
6. Configurer toutes les env vars (cf. section 3)
7. Créer la GitHub OAuth App
8. Inviter le commerçant comme collaborateur GitHub
9. Tester bout-en-bout

---

## 6. Récap des coûts Cloudflare Free Tier

| Ressource              | Limite gratuite        | Notre usage estimé    |
| ---------------------- | ---------------------- | --------------------- |
| Pages builds           | 500/mois               | ~50/mois              |
| Pages bandwidth        | Illimité               | ~10 GB/mois           |
| Workers requests       | 100 000/jour           | ~500/jour             |
| KV reads               | 100 000/jour           | ~1000/jour            |
| KV writes              | 1000/jour              | ~10/jour              |
| KV storage             | 1 GB                   | ~10 MB                |

→ **Marge de manœuvre x100 sur tous les axes**. Le site peut grossir 100× avant de toucher une limite.

---

**Action utilisateur immédiate** : créer un compte sur **[dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)** (gratuit, pas de CB demandée). Pendant ce temps, je migre le code.
