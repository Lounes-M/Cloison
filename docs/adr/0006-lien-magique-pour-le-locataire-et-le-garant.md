# ADR 0006 · Le lien magique, et ce qui reste vrai de « pas de compte »

**Date** : 1er septembre 2026
**Statut** : acceptée
**Portée** : précise l'[ADR 0002](0002-modele-d-acces-et-creation-de-compte.md) sur le seul point
que le passage au parcours locataire rouvrait. Première décision de la phase 3.

## Contexte

L'[ADR 0002](0002-modele-d-acces-et-creation-de-compte.md) posait que le garant et le locataire
n'ont jamais de compte : ils arrivent par un lien signé, et c'est la possession de ce lien qui donne
l'accès. Ça marchait tant que **l'agence** ouvrait le dossier, puisque c'est elle qui envoyait le
lien.

Le passage au parcours locataire casse cette évidence. Le locataire arrive sur le site, seul, sans
que personne lui ait rien envoyé. Il faut donc que quelque chose lui permette de revenir sur son
dossier demain, quand son garant aura déposé ses pièces. Et « quelque chose qui permet de revenir »
ressemble beaucoup à un compte.

Or trois endroits du produit promettent le contraire, dont le premier écran :
`lib/content/home.ts` affiche « pas de compte » en étiquette de héros, et `lib/content/agences.ts`
promet « aucun compte à créer, ni pour lui, ni pour son garant ».

## Décision

**Le locataire donne son adresse e-mail et reçoit un lien. Ce lien est sa clé.** Pas de mot de
passe, pas de profil, pas d'écran de connexion. Le garant reçoit le sien de la même façon, sur
l'adresse que le locataire a indiquée.

Mécaniquement, rien ne change par rapport à l'ADR 0002 : c'est le même jeton de capacité, le même
rôle Postgres `porteur_lien`, les mêmes politiques RLS. **L'e-mail n'est pas un moyen
d'authentification, c'est un canal de livraison.** Ce qui autorise reste le jeton ; l'adresse sert
seulement à le remettre à la bonne personne, et à le remettre une seconde fois si le premier message
se perd.

### Ce qui rend « pas de compte » encore vrai

La promesse n'est pas une abstraction philosophique sur l'identité, c'est une promesse de friction
et de trace. Elle tient à trois conditions, qui deviennent des contraintes de conception :

1. **Aucun mot de passe n'est jamais créé.** Rien à choisir, rien à retenir, rien à réinitialiser,
   et rien à voler qui serait réutilisable ailleurs.
2. **L'adresse est attachée au dossier, pas à une personne.** Il n'existe pas de table
   d'utilisateurs pour le locataire et le garant. L'adresse vit sur le dossier, et **disparaît avec
   lui** au terme des trois mois de l'[ADR 0003](0003-stockage-et-chiffrement-des-pieces.md).
3. **Rien ne se cumule d'un dossier à l'autre.** Un locataire qui revient six mois plus tard
   recommence à zéro. Il n'y a pas d'historique, pas de préférences, pas de tableau de bord.

Le jour où l'une des trois tombe, on aura des comptes, et il faudra changer le texte de la home
avant, pas après. C'est le vrai signal à surveiller, et il est plus utile qu'un débat sur le mot.

### Le lien est réémissible, le jeton ne l'est pas

Un lien perdu, un message classé en indésirable, une adresse mal tapée : le parcours doit survivre à
tout cela, sinon la promesse de fluidité tombe au premier accroc. Redemander son lien renvoie donc
un **jeton neuf**, et révoque le précédent par son `jti`.

Conséquence à ne pas manquer : un lien qui traîne dans une vieille boîte mail ne doit pas rouvrir un
dossier des mois plus tard. La révocation à la réémission et l'expiration font ce travail
ensemble.

### La dette de limitation de débit arrive à échéance

`docs/dettes.md` donnait comme signal de sortie « la première limite qui protège quelque chose de
sérieux, c'est-à-dire les liens d'accès en phase 3 ». **Ce signal est déclenché par cet ADR.**

Un point d'envoi de lien magique est exactement ce qu'il ne faut pas laisser sans limite : il envoie
des e-mails à une adresse choisie par l'appelant, ce qui en fait à la fois un amplificateur de spam
et un moyen de savoir si une adresse a un dossier. La limite passe donc à un magasin partagé, et la
réponse est **la même que l'adresse existe ou non** : « si un dossier correspond, le lien part »,
jamais « adresse inconnue ».

## Ce que cette décision ne tranche pas

**La durée de vie du jeton.** Elle se règle en regardant un vrai parcours : trop courte, le garant
qui ouvre son message le soir doit redemander un lien ; trop longue, un lien oublié reste vivant.
À fixer avec le premier dossier réel, pas ici.

**L'envoi lui-même.** Resend est déjà en place pour la notification des demandes d'agence, et fera
probablement l'affaire, mais un e-mail transactionnel dont dépend l'accès au produit n'a pas les
mêmes exigences de délivrabilité qu'une notification interne. À vérifier avant la mise en service.

**Le sort d'un dossier abandonné.** Un locataire qui ouvre un dossier et ne revient jamais laisse
une adresse en base. Les trois mois de l'ADR 0003 s'en chargent, mais un délai plus court pour un
dossier où le garant n'a rien déposé serait plus propre. À trancher avec la table `dossiers`.

## Conséquences

- La table `dossiers` porte l'adresse du locataire et celle du garant, et rien d'autre les
  concernant. Aucune table d'utilisateurs pour eux.
- Le jeton porte un `jti` révocable, et la réémission révoque le précédent : ce n'est plus une
  option, c'est ce qui rend le lien réémissible sans laisser d'anciens liens vivants.
- La limitation de débit à magasin partagé devient un prérequis de la mise en service, pas une
  amélioration ultérieure. La dette correspondante est réglée par la phase 3.
- Les trois formulations affichées (« pas de compte », « aucun compte à créer ») restent exactes et
  n'ont pas à changer. Elles deviennent en revanche **vérifiables** : les trois conditions ci-dessus
  disent à quoi les confronter.

## Alternatives écartées

**Un vrai compte pour le locataire** (mot de passe ou OAuth). Techniquement plus simple, et le
locataire est le seul des trois qui pourrait en tirer un bénéfice, puisqu'il revient. Mais il
faudrait retirer « pas de compte » du premier écran, sur un produit dont l'argument est justement de
ne rien demander à personne. Le coût est en marque, pas en code.

**Aucune persistance : le lien s'affiche une fois, à charge de le garder.** Cohérent avec le modèle
par capacité, et catastrophique en pratique. Un onglet fermé et le dossier est perdu, avec les
pièces d'un garant qui ne les redéposera pas une seconde fois.

**Un code à usage unique saisi à la main** plutôt qu'un lien cliquable. Meilleur contre le
détournement de lien, et une friction de plus sur un parcours qui n'en supporte pas beaucoup. À
revoir si un incident réel le justifie.
