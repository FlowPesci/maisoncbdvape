# Charte rédactionnelle des fiches produits

> Établie le 1er août 2026. Elle existe pour que les 121 fiches soient
> réécrites d'une seule main, et pour que les suivantes le soient de la même.

---

## Le vrai problème n'était pas la longueur

Au départ, le constat était « les descriptions sont trop longues et pas assez
vendeuses ». L'inventaire a montré autre chose :

| Champ | Rempli sur 121 fiches |
|---|---|
| `pointsForts` | **0** |
| `ficheTechnique` | **0** |
| `saveurs` | **0** |
| `contenuKit` | **0** |
| `couleurs` | **0** |
| `galerie` | **0** |

Ces six champs existent, le gabarit les affiche, et aucun n'a jamais été
rempli. Tout a été versé dans la prose. **La description ne raconte pas le
produit : elle fait à elle seule le travail de six champs.** C'est ce qui la
rend longue — et c'est ce qui la rend illisible, parce qu'un tableau de
caractéristiques déguisé en paragraphe ne se scanne pas.

Conséquence directe : les onglets « Fiche Technique » et « Contenu du Kit »
n'apparaissent sur aucune fiche du site.

**Règle qui découle de tout le reste : chaque information va dans son champ.**
Raccourcir la description sans remplir les autres champs, ce serait perdre de
l'information. Les remplir la raccourcit toute seule.

---

## Structure d'une fiche

### `descriptionCourte` — 90 à 140 signes

Ce que lit quelqu'un qui hésite entre deux produits. Elle doit répondre à
« pourquoi celui-ci ? », pas décrire.

Elle ne doit **jamais** être un extrait de la description longue : c'est le
cas sur 54 fiches aujourd'hui, et sur le Hash Primero elle est carrément une
ligne prise au milieu du paragraphe des arômes.

- ✗ « Notes terreuses et boisées dominantes, relevées d'accents de pin. »
- ✓ « Une résine tamisée à froid, souple sous le doigt, au bouquet boisé long en bouche. »

### `pointsForts` — 4 entrées, 4 à 8 mots chacune

L'élément le plus lu de la fiche. Un bénéfice concret par ligne, avec un
chiffre quand il en existe un. Pas de phrase, pas de ponctuation finale.

- ✓ « Batterie 1400 mAh, une journée pleine »
- ✗ « Une batterie performante offrant une autonomie confortable »

Un chiffre vaut mieux qu'un adjectif. « 4,5 ml » dit plus que « grande
capacité ».

### `description` — 600 à 900 signes

Deux ou trois paragraphes courts. Pas de titres internes, pas de listes : ce
qui se liste va dans `pointsForts` ou `ficheTechnique`.

Ne jamais commencer par le nom du produit — il est déjà affiché deux fois
au-dessus. C'est le cas sur 22 fiches, qui gaspillent leur première ligne.

Ordre qui fonctionne :
1. **À qui il s'adresse et pour quel usage** — la seule chose qu'aucun autre champ ne dit.
2. **Ce qui le distingue** — matière, fabrication, technologie.
3. **Ce qu'on ressent à l'usage** — sensoriel, concret.

### `ficheTechnique` — les chiffres

Tout ce qui est mesurable : capacité, autonomie, dimensions, matériau,
connectique, ratio PG/VG. Sort de la prose, entre ici.

### `saveurs`, `couleurs`, `contenuKit`

Les déclinaisons ne se racontent pas, elles se listent. Sur l'Al Fakher Crown
Bar, quatre saveurs sont décrites en prose avec un emoji chacune : elles
appartiennent à `saveurs`.

---

## Ton

**Sobre et expert.** Phrases nettes, vocabulaire précis, aucun superlatif.

À bannir : « révolutionne », « exceptionnel », « d'exception », « premium »
employé seul, « incontournable », « le meilleur ». Ces mots ne disent rien et
se retournent contre une boutique qui se veut haut de gamme — ils sonnent
comme une place de marché.

- ✗ « Le Hash Primero CBD est une résine d'exception, au parfum profond et raffiné. »
- ✓ « Un pressage artisanal à basse température, qui garde à la résine sa souplesse sous le doigt. »

**Aucun emoji.** 41 descriptions en contiennent (💨 🌿 👃 ⚡ 💧). Un emoji
n'est pas un dessin, c'est un caractère rendu par la police du système : son
apparence change d'un appareil à l'autre. Les pictogrammes du site sont des
tracés SVG (`components/icone.njk`) ; une description n'en a pas besoin.

**Pas d'entités HTML.** 44 fiches contiennent « adapt&eacute;e » ou
« l&rsquo;arôme », qui s'affichent tels quels. Écrire les accents directement.

---

## ⚠ Interdits légaux — CBD

**Aucune allégation de santé, de bien-être ou d'effet physiologique.**

Un produit au CBD n'est ni un médicament ni un complément alimentaire
autorisé à porter de telles mentions. Le règlement (CE) 1924/2006 et les
articles L121-2 et suivants du code de la consommation s'appliquent, et la
DGCCRF sanctionne régulièrement ce point. 21 fiches sont concernées
aujourd'hui.

| Interdit | Écrire à la place |
|---|---|
| « effet relaxant profond et durable » | « une fumée douce, longue en bouche » |
| « apporte apaisement et sérénité » | « à savourer sans hâte, en fin de journée » |
| « anti-stress », « bien-être » | décrire le moment, pas l'effet |
| « effets énergisants, stimulants » | « un profil vif, citronné, franc » |
| « clarté mentale », « concentration » | *(supprimer, sans remplacement)* |
| « soulage », « thérapeutique », « bienfaits » | *(supprimer)* |

**Le principe :** on décrit ce que le produit **est** et ce qu'on **perçoit**
— aspect, texture, arôme, goût, tenue. Jamais ce qu'il **fait** à celui qui
le consomme. Le sensoriel vend aussi bien, et il est vrai.

Mentions qui restent autorisées et utiles : taux de CBD, taux de THC
(< 0,3 %), mode de culture, origine, méthode d'extraction, absence
d'additifs.

**Vape et puffs :** ne jamais présenter le produit comme une aide au sevrage
tabagique. « Idéale pour les débutants souhaitant arrêter la cigarette »
(fiche Vibe SE 2) est à reformuler en « pensée pour une première cigarette
électronique ».

Ces règles sont vérifiées à la construction par
`scripts/verifier-redaction-produits.mjs`, qui fait échouer le build.
