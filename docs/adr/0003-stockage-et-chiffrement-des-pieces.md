# ADR 0003 · Stockage et chiffrement des pièces

**Date** : 1er septembre 2026
**Statut** : acceptée
**Portée** : tâche 13, laissée ouverte par l'[ADR 0001](0001-supabase-postgres-et-storage.md).
Décide aussi la rétention et l'effacement, qui n'en sont pas séparables.

## Contexte

L'[ADR 0001](0001-supabase-postgres-et-storage.md) a retenu Supabase Storage, et a explicitement
laissé une question sans réponse :

> _Une compromission côté Supabase donne-t-elle des documents lisibles ?_

Elle est vérifiée, et la réponse est **oui**. Supabase chiffre au repos en AES-256, avec des clés
protégées par des HSM, mais ce sont **leurs** clés. Il n'existe pas de clé gérée par le client pour
Storage. Ce chiffrement protège contre un disque volé dans un centre de données ; il ne protège ni
contre une compromission de la plateforme, ni contre la fuite de nos propres identifiants de projet.

Ce que Cloison stocke, ce sont des bulletins de paie et des avis d'imposition **appartenant à des
tiers**, remis par un garant qui n'a aucune relation commerciale avec nous et à qui on promet, en
haut de la page d'accueil, que personne ne voit ce qu'il ne doit pas voir. Un chiffrement dont la
clé appartient à l'hébergeur ne tient pas cette promesse.

## Décision

### Chiffrement applicatif par enveloppe

Chaque dossier reçoit une **clé de données** (DEK) tirée au hasard, en AES-256-GCM. Les pièces sont
chiffrées par notre serveur **avant** de partir vers Storage : Supabase ne reçoit jamais un octet
lisible. La DEK est stockée dans Postgres, elle-même chiffrée par une **clé maîtresse** (KEK).

AES-256-GCM via le module `crypto` de Node : aucune dépendance nouvelle, et un mode authentifié qui
détecte une altération du fichier plutôt que de renvoyer de la bouillie. Les routes qui chiffrent ou
déchiffrent tournent donc en runtime Node, pas Edge.

### La clé maîtresse ne vit pas chez Supabase

C'est le point qui porte tout l'ADR. **Le chiffré est chez Supabase, la clé est chez Vercel**, en
variable d'environnement serveur. Cette séparation protège contre une fuite isolée du stockage. Une compromission du serveur Vercel peut donner accès à la KEK et aux moyens d'accéder à Supabase : elle permet donc de déchiffrer les documents. Ce système ne constitue pas un chiffrement de bout en bout.

Mettre la KEK dans Supabase Vault serait le contresens exact de cette décision : la clé et le
chiffré partageraient le même rayon d'explosion, et on aurait payé la complexité du chiffrement pour
n'acheter aucune garantie. (`pgsodium`, l'autre candidat interne, est de surcroît en cours de
dépréciation.)

Ce choix est cohérent avec `scripts/verifie-variables-publiques.mjs` : la KEK est le secret le plus
dangereux du produit, elle ne porte évidemment jamais le préfixe `NEXT_PUBLIC_` et ne passe jamais
par le bloc `env` de `next.config.ts`.

### Les URLs signées deviennent inutilisables, et ce n'est pas une perte

Une URL signée Storage renverrait le chiffré, donc rien d'exploitable. Toute lecture d'une pièce
passe désormais par une route de notre serveur, qui déchiffre à la volée.

C'est un coût réel : pas de CDN sur les pièces, la bande passante traverse nos fonctions, et le
serveur voit le clair le temps du transfert. Mais l'architecture le demandait déjà par ailleurs : le
filigranage doit s'appliquer **à la génération du lien agence, pas au dépôt**, pour que le garant ne
voie jamais ses propres pièces dégradées. Il faut donc de toute façon un point de passage serveur
qui tient le fichier en clair. **Le point de déchiffrement et le point de filigranage sont le même
point.** La contrainte et le besoin convergent au lieu de s'ajouter.

### Rétention : trois mois, et la loi dit la même chose

Le produit annonce un dossier valable trois mois. La CNIL, dans son
[référentiel gestion locative](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000043535804)
(délibération n° 2021-057 du 6 mai 2021), retient **trois mois en base active** pour les données
collectées afin d'apprécier la solvabilité d'un candidat. La durée produit et la durée légale
coïncident : il n'y a pas d'arbitrage à faire.

Elle rappelle aussi que les pièces doivent être détruites **dès qu'elles ne servent plus à la
décision**. Trois mois est donc un plafond, pas un délai à consommer : le compte à rebours réel
démarre à la décision de l'agence (signature ou refus) et l'immense majorité des dossiers meurent
là, bien avant l'échéance.

### L'effacement est cryptographique

Supprimer un fichier d'un stockage objet ne le supprime pas des sauvegardes, et aucun hébergeur ne
garantit l'inverse à la seconde près. On ne fait donc pas reposer la promesse de suppression sur une
suppression.

**À l'expiration, on détruit la DEK du dossier.** Les pièces deviennent illisibles dans la base active. Une ancienne sauvegarde contenant la DEK scellée reste déchiffrable avec la KEK : sa rétention doit être limitée et toute restauration doit rejouer les purges avant ouverture des accès. Les objets sont
ensuite supprimés pour de bon, par la route authentifiée `/api/maintenance`, mais en second rideau, pas comme
garantie.

C'est la deuxième raison d'être du chiffrement, et elle vaut la première : elle rend la promesse
d'effacement **vérifiable** au lieu de déclarative.

## Ce que cette décision ne tranche pas

**Le format du filigrane.** Le point de passage est décidé, ce qu'il inscrit ne l'est pas : ADR
suivant.

**La rotation de la KEK, mise a jour du 13 septembre 2026.** Les enveloppes v2
portent maintenant un identifiant de cle ; le lecteur conserve la compatibilite
avec les enveloppes historiques. Le rescellement administratif compare la valeur
precedente pour ne pas annuler une suppression concurrente. Suivre la
[procedure de rotation](../exploitation/rotation-cles.md), notamment la conservation
des cles necessaires aux anciennes enveloppes et aux sauvegardes. L'outillage et
ses tests fictifs ne prouvent pas une rotation de production ni la disponibilite
des cles de secours.

**Un vrai KMS.** Une variable d'environnement Vercel est un endroit correct pour une clé maîtresse à
ce stade, pas un endroit idéal. Le signal de sortie est le premier salarié qui a accès au tableau de
bord Vercel sans avoir à connaître la KEK : c'est-à-dire le moment où la séparation des rôles
devient un vrai sujet, et non plus une affaire de deux fondateurs.

**La signature électronique.** Le prestataire doit recevoir l’acte à signer, sans les justificatifs de revenus. La chaîne attend un modèle contractuel validé.

## Conséquences

- **Perdre la KEK, c'est perdre tous les dossiers.** Il n'y a pas de récupération, c'est le principe
  même. Elle doit être sauvegardée hors de Vercel **et** hors de Supabase, avant la première pièce
  réelle. Ce n'est pas une précaution d'exploitation, c'est une condition de mise en service.
- Supabase reste un sous-traitant, mais ne détient plus que du chiffré. Cela ne le sort pas du
  registre RGPD (tâche 17) et n'annule pas le DPA, mais cela change ce qu'une violation chez lui
  signifierait, et c'est un argument opposable dans la conversation avec une agence.
- Pas de CDN sur les pièces. Une consultation d'agence coûte de la bande passante de fonction. À
  surveiller au moment où le pilote passe à l'échelle.
- Le schéma des dossiers portera la DEK chiffrée et sa version de clé. Détruire cette colonne est
  l'acte d'expiration.
- Une file de suppression Storage reprise par la maintenance (migration 0021).
- La dette « chiffrement des pièces » de l'ADR 0001 est réglée ; celle du registre RGPD ne l'est pas.

## Alternatives écartées

**S'en remettre au chiffrement au repos de Supabase** : c'est l'option par défaut, et c'est
exactement celle à laquelle l'ADR 0001 a refusé de se rabattre sans l'avoir regardée. La
vérification donne la réponse : leurs clés, donc leur rayon d'explosion.

**Supabase Vault ou `pgsodium` pour la clé** : met la clé à côté du chiffré. Aucune garantie
achetée, et `pgsodium` est en cours de dépréciation.

**CipherStash / ZeroKMS** : une vraie réponse, avec une clé par valeur et une gestion externe. Mais
c'est un sous-traitant de plus, un coût récurrent avant le premier euro de revenu, et une
dépendance structurante prise trop tôt. À revoir si le volume ou un client grand compte le justifie.

**Chiffrer dans le navigateur du garant** : séduisant, et incompatible avec le produit : l'agence
doit lire les pièces, donc la clé doit lui parvenir. Sans compte de garant, il n'existe aucun
endroit sûr où la déposer entre les deux. On aurait un coffre dont la clé voyage dans les liens.

**Ne pas stocker du tout, tout faire transiter** : l'agence consulte le dossier quand elle le
décide, pas au moment du dépôt. Il faut bien que les pièces attendent quelque part.
