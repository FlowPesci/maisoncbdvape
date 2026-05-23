# 🚀 Tabac Gex — Mode d'emploi Cowork

Ce dossier contient ton site e-commerce Tabac Gex en cours de construction. Voici comment démarrer la suite avec **Claude Cowork**.

---

## En 4 étapes

### 1. Place ce dossier sur ton ordinateur

Décompresse l'archive et place le dossier `tabacgex-eleventy` à un endroit que tu retrouveras facilement. Recommandation :

- **Mac** : `~/Documents/tabacgex-eleventy/`
- **Windows** : `C:\Users\<TonNom>\Documents\tabacgex-eleventy\`

### 2. Ouvre Claude Desktop

- Lance l'app **Claude Desktop** (pas le navigateur, l'application installée).
- Si tu ne la vois pas, télécharge-la sur [claude.com/download](https://claude.com/download).
- Connecte-toi avec ton compte Pro.

### 3. Crée un Projet Cowork pour Tabac Gex

- Clique sur l'onglet **Cowork** en haut de la fenêtre Claude Desktop.
- Crée un **nouveau projet** appelé `Tabac Gex`.
- Dans les paramètres du projet, ajoute le **dossier de travail** : `~/Documents/tabacgex-eleventy/` (ou ton chemin équivalent).
- Tu donneras à Claude la permission de lire / écrire dans ce dossier — c'est sandboxé, il ne touchera à rien d'autre sur ton ordi.

### 4. Lance la commande de démarrage

Copie-colle **exactement** ce message à Cowork dans le chat du projet :

```
Salut Cowork. Tu reprends un projet en cours. 

Avant tout, lis le fichier BRIEF.md à la racine du dossier. Il contient l'historique complet, l'état actuel du projet, et le plan détaillé des étapes restantes (0 à 7).

Lis aussi rapidement les 3 maquettes HTML dans docs/maquettes-source/ — ce sont les sources de vérité visuelles pour le design.

Une fois ces lectures faites, démarre par l'étape 0 du BRIEF : vérifier que `npm install` puis `npm run dev` fonctionnent, et que le site s'affiche bien sur http://localhost:8080.

Avant de passer à l'étape suivante, tu m'expliques ce que tu vois marcher et tu attends ma validation. Je suis débutant en code, donc parle-moi simplement et signale-moi clairement quand c'est à moi de faire une action manuelle (créer un compte, valider un email, etc.).

Tu peux y aller.
```

---

## Ce qui va se passer ensuite

Cowork va :
1. **Lire le brief** et te résumer ce qu'il a compris
2. **Lancer `npm install`** dans ton terminal (ça prend 1-2 minutes la première fois)
3. **Démarrer le serveur local** et te dire « va sur http://localhost:8080 »
4. **Te demander de regarder** la page et lui dire si tu vois bien la home avec le hero noir et les cartes produits
5. **Enchaîner** sur la suite des étapes (placeholders d'images → pages produits → pages catégories → CMS d'admin → déploiement Netlify)

Pour chaque étape, **tu auras le résultat visible dans ton navigateur** avant de passer à la suivante. Si quelque chose ne te plaît pas visuellement, dis-le-lui — il ajustera.

---

## Quand demander à Cowork de s'arrêter

- Si tu ne comprends plus ce qu'il fait → dis « **explique-moi en français simple ce que tu fais et pourquoi** »
- S'il modifie quelque chose qui te semble dangereux → dis « **stop, qu'est-ce que tu viens de changer ?** »
- Si tu as besoin d'une pause → dis « **on reprend demain, fais un récap de l'état du projet** »

Cowork s'arrête à chaque action sensible (suppression, push Git, etc.) pour te demander confirmation.

---

## Limite de capacité (Pro)

Avec le plan Pro, tu as une enveloppe d'usage par 5 heures. Cowork consomme **plus vite** que le chat classique. Pour ce projet :

- **Étapes 0 à 4 (le local)** : largement faisable en Pro
- **Étapes 5 à 7 (CMS + déploiement)** : si tu sens que tu approches de la limite, fais une pause de 5h ou envisage le passage temporaire en Max le temps de finir le déploiement

---

## Tu n'as pas envie d'utiliser Cowork ?

Pas de problème. Tu peux aussi :
- Continuer dans le chat classique : ouvre les fichiers du dossier, dis-moi à quelle étape tu en es, je continue à te livrer le code à copier-coller
- Le BRIEF.md te servira de mémo

Mais sincèrement, pour ce qui reste à faire (surtout le déploiement Netlify et la config Decap CMS), Cowork va te faire gagner **plusieurs heures** d'aller-retours.

---

Bonne suite 🚀
