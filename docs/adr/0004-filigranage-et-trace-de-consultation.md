# ADR 0004 — Filigranage et trace de consultation

**Date** : 1er septembre 2026
**Statut** : acceptée
**Portée** : dernier point de stockage laissé ouvert par `docs/architecture.md`. S'appuie
directement sur l'[ADR 0002](0002-modele-d-acces-et-creation-de-compte.md) (comptes nominatifs) et
l'[ADR 0003](0003-stockage-et-chiffrement-des-pieces.md) (déchiffrement côté serveur).

## Contexte

La page `/agences` fait deux promesses distinctes, dans la même phrase :

> _Vous voyez ce qu'il faut pour décider, dans un format qui vous engage à ne pas le diffuser.
> Chaque consultation laisse une trace._

Elles sont souvent confondues, et elles ne demandent pas la même chose :

- **Dissuader** — que l'agence sente le document tracé, et ne le transfère pas.
- **Attribuer** — qu'un document échappé désigne celui qui l'a laissé partir.

Seule la seconde impose un marquage **nominatif et par consultation**. Mais elle offre la première
en prime : un filigrane générique dissuade mal, parce que tout le monde sait que personne ne pourra
remonter jusqu'à lui.

## Décision

### Le filigrane nomme une personne et un instant

Pas « Cloison — confidentiel », mais le collaborateur, son agence, l'horodatage et la référence du
dossier. **Chaque consultation produit un exemplaire unique**, attribuable à celui qui l'a demandé.

C'est ce que les deux ADR précédentes rendent possible, et c'est pour cela qu'elles viennent avant :
l'[ADR 0002](0002-modele-d-acces-et-creation-de-compte.md) garantit qu'un compte est une personne et
non une agence — un compte partagé par huit négociateurs rendrait le nom inutile — et
l'[ADR 0003](0003-stockage-et-chiffrement-des-pieces.md) impose déjà que chaque lecture traverse une
route serveur pour être déchiffrée. **Le point de déchiffrement, le point de filigranage et le point
de traçage sont le même point.** Il n'y a pas de coût architectural supplémentaire à marquer
nominativement plutôt que génériquement : c'est le même passage, avec une chaîne de caractères
différente.

### Les pages sont rasterisées, pas estampillées

Un filigrane posé dans la couche de contenu d'un PDF s'enlève en quelques secondes avec n'importe
quel éditeur. Un filigrane amovible ne dissuade personne et n'attribue rien : il donne l'illusion de
la protection, ce qui est pire que rien puisqu'on cesse alors de se méfier.

Chaque page est donc **rendue en image, composée avec le filigrane, puis réassemblée en PDF**. La
marque est dans les pixels.

Ce qu'on y perd : la sélection de texte, la recherche dans le document, et des fichiers plus lourds.
Pour une agence qui lit un bulletin de paie afin de décider, c'est un coût acceptable — elle lit, elle
ne réexploite pas.

Ce qu'on y gagne en second : **la rasterisation détruit tout contenu actif d'un PDF déposé**
(JavaScript embarqué, formulaires, fichiers joints). Le garant téléverse des fichiers arbitraires ;
ce qui arrive à l'agence n'est plus qu'une suite d'images. Une surface d'attaque disparaît sans
qu'on ait eu à la traiter pour elle-même.

### Des bibliothèques permissives, et c'est un piège à éviter

**MuPDF est sous AGPL** — comme `mupdf.js` et `PyMuPDF`, qui en dérivent. Pour un service en ligne,
la clause réseau de l'AGPL impose de publier le code source de l'application entière, ou d'acheter
une licence commerciale à Artifex. C'est l'outil le plus tentant pour ce travail, et c'est celui qui
transformerait un choix technique en engagement juridique sur tout le produit.

On retient donc **`pdfjs-dist`** (Apache 2.0) pour le rendu et **`pdf-lib`** (MIT) pour le
réassemblage. Toutes deux permissives, aucune obligation de réciprocité.

À surveiller : `pdfjs` en Node demande une implémentation de canvas, et le paquet pèse assez pour
peser sur le démarrage à froid d'une fonction. C'est un sujet de performance, pas de conception.

### La trace est en écriture seule

« Chaque consultation laisse une trace » ne vaut que si la trace ne peut pas être effacée par celui
qu'elle désigne. Une table `consultations` reçoit donc une ligne par lecture — qui, quel dossier,
quelle pièce, quand — et le modèle à trois rôles de l'ADR 0002 la rend appendante : l'agence peut
**lire** ses propres traces, personne ne reçoit de droit `update` ni `delete`. Ni un administrateur
d'agence, ni le serveur applicatif.

### Le garant ne voit jamais ses pièces dégradées

Réaffirmé, parce que c'est la règle qui décide de l'endroit : le filigranage s'applique **à la
consultation par l'agence**, jamais au dépôt. Le chiffré d'origine reste intact ; le garant qui
relit son dossier relit ses documents, pas une copie marquée à son nom.

### L'agence peut télécharger

La lecture seule dans une visionneuse ne résiste pas à une capture d'écran, et elle irriterait
l'acheteur — celui qui paie. On autorise donc le téléchargement. La protection ne vient pas de
l'empêchement, elle vient de ce que **chaque exemplaire en circulation porte un nom**.

## Ce que cette décision ne tranche pas

**Le filigranage invisible.** Un marquage stéganographique survivrait à un recadrage, et c'est
précisément la parade au filigrane visible. Mais il demande une robustesse réelle — au
réenregistrement, à l'impression puis au scan, à la recompression — pour un gain qui reste théorique
tant qu'aucune fuite n'a eu lieu. Et le recadrage se voit : un document amputé de son bandeau est
visiblement altéré, ce qui le décrédibilise autant qu'il anonymise.

**Signal de sortie** — la première fuite où la marque visible avait été retirée.

**Le contrôle d'authenticité des pièces.** Un avis d'imposition se vérifie auprès de
l'administration fiscale, un bulletin de paie ne se vérifie pas. C'est un sujet de fraude, pas de
confidentialité, et il mérite sa propre décision — probablement la plus forte du produit après le
cloisonnement lui-même.

**Le format exact du bandeau.** Position, opacité, répétition sur la page : ça se règle en regardant
un document filigrané, pas en l'écrivant dans un ADR.

## Conséquences

- Une consultation coûte du calcul, pas seulement de la bande passante. Le rendu de toutes les pages
  d'un dossier n'est pas gratuit, et l'[ADR 0003](0003-stockage-et-chiffrement-des-pieces.md)
  interdisait déjà le CDN. À surveiller ensemble au passage à l'échelle.
- Une mise en cache est envisageable **par (pièce, personne)**, jamais par pièce seule : deux
  personnes ne doivent jamais recevoir le même fichier.
- La table `consultations` arrive avec `dossiers`, en phase 3, et sans aucun droit d'écriture après
  coup.
- Les pièces livrées à l'agence ne sont plus exploitables par machine. Si un jour on veut lire un
  montant automatiquement, ce sera fait **avant** filigranage, sur le clair, côté serveur.

## Alternatives écartées

**Un filigrane textuel posé sur le PDF d'origine** — dix fois moins cher, et retirable en quelques
secondes. Il rendrait la promesse d'attribution fausse tout en la laissant affichée.

**Un filigrane générique « Cloison — confidentiel »** — dissuade mal, puisqu'il ne désigne personne,
et n'attribue rien. Le nominatif ne coûte pourtant rien de plus : c'est la même chaîne de traitement.

**MuPDF** — techniquement le meilleur outil, et sous AGPL. Le retenir imposerait de publier le code
du produit ou d'acheter une licence commerciale, pour une opération que deux bibliothèques
permissives couvrent.

**Ne pas laisser télécharger** — repousse la fuite d'un cran (la capture d'écran reste), au prix
d'une gêne pour l'acheteur. Mauvais échange.
