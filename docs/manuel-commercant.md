# 📖 Manuel — Tabac Gex (côté commerçant)

Ce manuel explique comment gérer le site `vapelab.fr` au quotidien : modifier
un produit, suivre les commandes, traiter une réservation Click & Collect.

---

## 1. Se connecter à l'admin

L'administration du site se trouve à deux adresses :

| Adresse                                         | Pour quoi ?                              |
| ----------------------------------------------- | ---------------------------------------- |
| `https://vapelab.fr/admin/`                    | Modifier les produits, catégories, infos |
| `https://vapelab.fr/admin/commandes/`          | Voir et gérer les commandes              |

**Identifiant** : ton email + le mot de passe que tu as choisi à l'invitation.

---

## 2. Modifier un produit

1. `/admin/` → "Catalogue produits" → "Liste des produits"
2. Clique sur le produit à modifier (ex : "Kit Box Gen SE")
3. Modifie les champs : prix, stock, description, photos…
4. Bouton **"Enregistrer"** puis **"Publier" → "Publier maintenant"**
5. Le site se met à jour automatiquement en **2-3 minutes**

### 💡 Bons réflexes

- **Stock à 0** = produit en "Rupture", visiteurs ne peuvent plus l'ajouter au panier
- **Décocher "Actif"** = produit masqué partout (sans le supprimer)
- **Tags "Nouveauté" / "Hot" / "Promo"** = badge automatique sur la fiche
- **Photos** : plusieurs photos par produit possibles (galerie). La 1re est l'image principale.

---

## 3. Suivre les commandes

`/admin/commandes/` → liste de toutes les commandes, plus récentes en haut.

### Statuts

| Statut          | Sens                                                                   |
| --------------- | ---------------------------------------------------------------------- |
| En attente      | Réservation créée (en magasin) ou paiement en attente                  |
| Payée           | Le client a payé en ligne via Viva Wallet                              |
| En préparation  | Tu commences à préparer la commande                                    |
| Prête           | Commande prête → email "à récupérer" envoyé automatiquement au client   |
| Récupérée       | Le client est passé chercher                                           |
| Annulée         | Commande abandonnée (paiement refusé, etc.)                            |

### Workflow type

1. **Reçoit notification email** : "🆕 Nouvelle réservation" ou "💰 Paiement reçu"
2. Va dans `/admin/commandes/` → clique sur la commande
3. Clique **"En préparation"** quand tu commences
4. Quand c'est prêt → **"Prête à récupérer"** : un email part automatiquement au client
5. Quand le client passe la chercher → **"Récupérée"**

⚠️ Si paiement en magasin → encaisse au moment du retrait (CB, espèces).

---

## 4. Cas particuliers

### Le client n'arrive pas à payer en ligne
Pas grave : la commande passe en "Annulée" automatiquement, aucun montant n'est débité. Le client peut refaire la commande ou choisir "payer en boutique".

### Annuler une commande après coup
Dans la fiche commande → bouton "Annulée" dans la sidebar Actions.
**Si paiement en ligne** : pour rembourser, va dans le dashboard Viva Wallet, retrouve la transaction et fais "Refund".

### Modifier le prix d'un produit alors que des commandes sont en cours
Pas de problème : les commandes sont figées au prix au moment de l'achat. Le nouveau prix s'applique uniquement aux nouvelles commandes.

---

## 5. Surveiller son business

### Métriques clés à regarder

- **Nombre de commandes/jour** : `/admin/commandes/` (filtrer par "Toutes")
- **CA jour** : compter manuellement (futur : page stats)
- **Taux d'abandon paiement** : nombre d'"Annulée" vs total

### Côté Viva Wallet

Dashboard `https://www.vivapayments.com/` → onglet "Transactions" :
- Voir les paiements réels
- Faire un remboursement si nécessaire
- Télécharger un relevé bancaire

### Côté Resend (emails)

Dashboard `https://resend.com/` → onglet "Logs" :
- Vérifier que les emails partent bien
- Voir les bounces (emails refusés)

---

## 6. En cas de problème

| Souci                                   | Que faire                                              |
| --------------------------------------- | ------------------------------------------------------ |
| Le site est en panne                    | Va sur Netlify → Deploys → vérifier le dernier build   |
| Une commande n'apparaît pas             | Vérifier les logs Netlify Functions (onglet Functions) |
| Un client n'a pas reçu son email        | Resend → Logs → chercher l'adresse                     |
| Le paiement Viva ne marche pas          | Viva Wallet → Settings → vérifier l'API Key            |
| Modification CMS qui ne se voit pas     | Attendre 2-3 min (rebuild), forcer Ctrl+Shift+R        |

**Si rien ne marche → contacte le développeur** (Florian — leblanc.florian.8@gmail.com).
