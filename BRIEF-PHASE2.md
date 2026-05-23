# 📋 BRIEF — Phase 2 : Paiement Viva Wallet + Click & Collect + Back-office

**Date** : 2026-04-28
**Statut** : en cours
**Périmètre** : extension du site MVP (BRIEF.md) avec un véritable e-commerce.

> ⚠️ Cette phase **étend** le site statique livré au BRIEF.md initial.
> Le BRIEF.md d'origine excluait le paiement réel — cette Phase 2 le réintroduit
> à la demande du propriétaire (FlowPesci).

---

## 1. Architecture cible

```
[Site statique Eleventy]                                     [Service externes]
     │                                                              │
     ├── /panier/ ─────────► (lit localStorage)                    │
     │                                                              │
     ├── /commande/ ──────► [POST submit-reservation] ─┬─► Netlify Blobs (commandes)
     │                                                  │
     │                       [POST create-payment] ────┼─► Viva Wallet API ──► Smart Checkout
     │                                                  │                            │
     ├── /commande/return/ ◄── [GET viva-callback] ◄────┘                            │
     │                                                                               │
     │                       [POST viva-webhook] ◄─── Viva (server-to-server)        │
     │                            │                                                  │
     │                            ├─► Netlify Blobs (update statut)                  │
     │                            └─► Resend (emails client + commerçant)            │
     │                                                                               │
     └── /admin/commandes/ ──► [GET list-orders / get-order / update-order-status]
                                  (auth Netlify Identity)
```

**Stack ajoutée :**

| Outil               | Rôle                                     | Coût                    |
| ------------------- | ---------------------------------------- | ----------------------- |
| Netlify Functions   | Code serveur "à la demande"              | Gratuit ≤ 125 k req/mois |
| Netlify Blobs       | Stockage des commandes (clé-valeur)     | Gratuit ≤ 1 GB          |
| Viva Wallet         | Smart Checkout (paiement CB / wallets)   | ~1-2 % par transaction  |
| Resend              | Emails transactionnels                   | Gratuit ≤ 3000/mois     |

Aucune nouvelle dépendance externe à installer côté visiteur — tout reste serverless.

---

## 2. Modèles de données

### 2.1 Panier (localStorage côté client)

Clé : `tabacgex_cart_v1` — déjà en place.

```json
[
  { "id": "kit-box-gen-se-vaporesso", "qty": 2, "addedAt": 1714305600000 }
]
```

Le panier ne contient que `id` + `qty`. Les détails (nom, prix, image) sont
ré-hydratés à l'affichage en croisant avec `produits.json`.

### 2.2 Commande (Netlify Blobs)

Stocké dans le store `orders` avec la clé `<orderId>`.

```json
{
  "orderId": "TG-202604281430-A1B2",
  "createdAt": "2026-04-28T14:30:00Z",
  "status": "pending|paid|preparing|ready|completed|cancelled",
  "client": {
    "nom": "Jean Dupont",
    "email": "jean@example.com",
    "telephone": "+33612345678",
    "notes": "Préfère emballage cadeau"
  },
  "items": [
    { "id": "kit-...", "nom": "...", "marque": "...", "prix": 69.9, "qty": 1, "image": "..." }
  ],
  "totalHT": 58.25,
  "totalTVA": 11.65,
  "totalTTC": 69.90,
  "creneauRetrait": { "date": "2026-05-01", "heure": "15:00" },
  "paiement": {
    "methode": "viva-wallet|en-magasin",
    "vivaTransactionId": null,
    "vivaOrderCode": null,
    "paidAt": null
  },
  "history": [
    { "at": "2026-04-28T14:30:00Z", "status": "pending", "by": "system", "note": "Commande créée" }
  ]
}
```

**Statuts :**

| Statut       | Sens                                              |
| ------------ | ------------------------------------------------- |
| `pending`    | Commande créée, paiement en attente (ou C&C)      |
| `paid`       | Paiement confirmé (uniquement si Viva)            |
| `preparing`  | Le commerçant prépare la commande                 |
| `ready`      | Prête à être récupérée — email client envoyé      |
| `completed`  | Récupérée                                         |
| `cancelled`  | Annulée (paiement échoué, abandonnée, etc.)       |

### 2.3 ID de commande

Format : `TG-YYYYMMDDHHmm-XXXX` (XXXX = 4 caractères alphanumériques aléatoires).
Lisible humainement, pas trop long, raisonnablement unique.

---

## 3. Variables d'environnement Netlify

À configurer dans **Site settings → Environment variables** quand les comptes sont prêts :

| Clé                         | Valeur                                            | Phase   |
| --------------------------- | ------------------------------------------------- | ------- |
| `VIVA_MERCHANT_ID`          | Merchant ID Viva (sandbox d'abord)                | D       |
| `VIVA_API_KEY`              | API Key Viva                                      | D       |
| `VIVA_SOURCE_CODE`          | Code source (boutique) Viva                       | D       |
| `VIVA_ENV`                  | `demo` (sandbox) ou `live` (prod)                 | D       |
| `VIVA_WEBHOOK_KEY`          | Clé fournie par Viva pour vérifier les webhooks   | D       |
| `RESEND_API_KEY`            | API Key Resend                                    | C, F    |
| `EMAIL_FROM`                | Expéditeur (ex: `Tabac Gex <noreply@…>`)          | C, F    |
| `EMAIL_MERCHANT`            | Email du commerçant (notifs nouvelles commandes)  | C, F    |
| `SITE_URL`                  | https://tabacgex.netlify.app (ou tabacgex.fr)     | C, D    |

**Côté code**, on utilise `process.env.VIVA_API_KEY` etc. dans les Functions.
Pour le développement local : un `.env` est gitignored (jamais commité).

---

## 4. Phases de livraison (ordre)

### ☐ Phase 0 — Préparation (action utilisateur, ~30 min)
- [ ] Créer compte Viva Wallet (`vivawallet.com` → Marchand)
- [ ] Récupérer `Merchant ID`, `API Key`, `Source Code` en mode demo
- [ ] Créer compte Resend (`resend.com`) — récupérer API Key
- [ ] Configurer les variables d'environnement Netlify ci-dessus

### ✅ Phase A — Page panier `/panier/`
- [ ] `src/panier.njk` : grille des items, qty +/-, suppression, totaux
- [ ] JS panier dans `tabacgex.js` (lecture localStorage, ré-hydratation produits)
- [ ] Lien "Continuer la commande" → `/commande/`
- [ ] Empty state si panier vide

### ✅ Phase B — Page commande `/commande/`
- [ ] `src/commande.njk` : formulaire (nom, email, tel, créneau, notes)
- [ ] Validation client (email valide, tel format FR, créneau futur)
- [ ] Récap des items (lecture localStorage)
- [ ] 2 CTA : "Réserver et payer en boutique" / "Payer en ligne"

### ✅ Phase C — Click & Collect
- [ ] `netlify/functions/_shared/orders.js` (CRUD Netlify Blobs)
- [ ] `netlify/functions/_shared/email.js` (Resend, stubbed si pas de clé)
- [ ] `netlify/functions/submit-reservation.js`
- [ ] `src/commande/confirmation.njk` (page post-submit avec orderId)

### ✅ Phase D (code prêt, attente creds) — Paiement Viva Wallet
- [ ] `netlify/functions/create-payment.js` (création OrderCode Viva)
- [ ] `netlify/functions/viva-callback.js` (return URL après paiement)
- [ ] `netlify/functions/viva-webhook.js` (server-to-server, statut paiement)
- [ ] `src/commande/paiement-en-cours.njk` (loader pendant redirect)
- [ ] `src/commande/paiement-echec.njk` (page d'erreur)

### ✅ Phase E — Back-office `/admin/commandes/`
- [ ] `netlify/functions/_shared/auth.js` (vérif JWT Netlify Identity)
- [ ] `netlify/functions/list-orders.js`
- [ ] `netlify/functions/get-order.js`
- [ ] `netlify/functions/update-order-status.js`
- [ ] `src/admin/commandes.njk` (liste + filtres)
- [ ] `src/admin/commande.njk` (détail + actions)

### ✅ Phase F — Templates emails
- [ ] `emails/reservation-client.html` — confirmation client (Click & Collect)
- [ ] `emails/reservation-merchant.html` — notif commerçant
- [ ] `emails/paiement-client.html` — confirmation client (paiement OK)
- [ ] `emails/paiement-merchant.html` — notif commerçant (paiement OK)
- [ ] `emails/ready-client.html` — commande prête à être récupérée

### ☐ Phase G — Tests + production
- [ ] Tests sandbox Viva (paiement OK, refusé, annulé)
- [ ] Tests Click & Collect (réservation, modification statut)
- [ ] Tests emails (envoi, réception, design responsive)
- [ ] Bascule `VIVA_ENV=live` quand le compte prod est validé
- [ ] Mini doc pour le commerçant (`docs/manuel-commercant.md`)

---

## 5. Décisions architecturales notables

### 5.1 Pourquoi Netlify Blobs et pas une vraie DB ?
- **Volume attendu** : un commerce local fait < 100 commandes/jour. Largement OK pour Blobs.
- **Coût zéro** : pas de DB hébergée à payer.
- **Intégration native** : pas de credentials à gérer, accès direct depuis Functions.
- **Si scale** : facile de migrer vers Supabase plus tard (Blobs → SELECT).

### 5.2 Pourquoi Smart Checkout (et pas Native) ?
- **Sécurité PCI-DSS** : on ne touche jamais les données de carte. Viva les gère sur sa page.
- **Mobile-first** : la page Viva est responsive, supporte Apple Pay / Google Pay nativement.
- **Simplicité** : pas de SDK à intégrer, pas de tokenisation.
- **Trade-off** : on perd le control total du design du formulaire CB (mais c'est OK, on revient sur notre site juste après).

### 5.3 Pourquoi Resend (et pas Netlify Email) ?
- **Plus mature** : Resend a une excellente DX, documentation, dashboard.
- **Plus généreux** : 3000/mois gratuit vs Netlify Email beaucoup plus restreint.
- **Domaine personnalisé** : on pourra envoyer depuis `noreply@tabacgex.fr` quand le domaine sera là.

### 5.4 Pourquoi pas une page de paiement custom ?
- **Compliance PCI-DSS** : un formulaire CB sur notre site nous oblige à des audits payants annuels.
- **Smart Checkout** = page hébergée par Viva = compliance déléguée.

### 5.5 Sécurité du back-office
- Les functions admin (`list-orders`, `update-order-status`) vérifient le JWT envoyé par le navigateur.
- Le JWT est issu de Netlify Identity (utilisateur invité par le commerçant).
- Sans JWT valide → réponse 401.

---

## 6. Hors-périmètre Phase 2 (à considérer plus tard)

- Système d'avis clients (commentaires modérés)
- Programme de fidélité / cartes cadeaux
- Newsletter (Mailchimp, Brevo…)
- Statistiques de ventes (Plausible, Umami)
- Recherche full-text dans le catalogue
- Gestion des stocks "intelligente" (alerte stock bas, commande auto fournisseur)
- Multi-langue (anglais)
- Programme parrainage

---

## 7. Documentation à produire à la fin

- `docs/manuel-commercant.md` : comment se connecter, gérer les commandes, modifier les produits, comprendre les statuts.
- `docs/architecture.md` : pour un futur développeur reprenant le projet.
- README.md : mise à jour avec les nouvelles fonctionnalités.

---

**Bon travail.** — *Phase 2 démarrée le 2026-04-28*
