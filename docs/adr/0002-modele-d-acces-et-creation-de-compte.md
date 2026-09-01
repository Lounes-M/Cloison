# ADR 0002 · Modèle d'accès : qui peut créer un compte

**Date** : 1er septembre 2026
**Statut** : acceptée
**Portée** : tâche 11 (modèle d'accès), laissée ouverte par l'[ADR 0001](0001-supabase-postgres-et-storage.md).
Tranche l'authentification des agences, que l'ADR 0001 renvoyait à la phase 4.

## Contexte

Trois acteurs, et une promesse affichée sur la page d'accueil : **pas de compte**. Elle est reprise
mot pour mot sur `/agences` : « Aucun compte à créer, ni pour lui, ni pour son garant ».

Elle ne dit rien de l'agence. Et l'agence est un cas différent des deux autres : elle revient, sur
des dizaines de dossiers, avec plusieurs collaborateurs, et c'est elle qui paie. L'ADR 0001 l'avait
vu (« elle voudra probablement un vrai compte ») et renvoyait la décision en phase 4.

**Ce report était une erreur de séquencement.** Le modèle de session se conçoit en phase 2, et il ne
peut pas se concevoir sans savoir s'il porte un émetteur de jetons ou deux. On tranche donc
maintenant, quitte à n'implémenter qu'en phase 3.

## Décision

### La règle

> **La création de compte est libre. Ce qui est contrôlé, c'est le droit d'envoyer un lien à un vrai
> garant.**

Filtrer à l'inscription mettrait une boîte mail sur le chemin critique de la croissance, pour
protéger le mauvais évènement. Le risque n'est pas qu'un inconnu ouvre un compte : c'est qu'il
collecte les bulletins de paie d'un tiers. La barrière tombe là, et nulle part avant.

Un compte non vérifié est un compte complet : produit entier sur un **dossier de démonstration**,
invitation de collègues, tout sauf l'envoi d'un lien réel. C'est ce qui rend l'inscription ouverte
autre chose qu'un décor, et ce qui transforme une demande d'activation en prospect qualifié, dont
on sait ce qu'il a essayé, plutôt qu'en formulaire de contact.

### Un compte est une personne

Une personne physique, adresse e-mail professionnelle vérifiée, rattachée à **une** agence. Jamais
un compte partagé par toute l'agence : `/agences` promet que « chaque consultation laisse une
trace », et une trace qui ne nomme personne ne vaut rien.

Deux rôles internes, `admin` et `membre`. Les membres voient **tous** les dossiers de leur agence :
la gestion locative se fait à plusieurs, il y a des congés et du turnover. Le cloisonnement se joue
entre garant, locataire et agence : pas entre deux collègues. Accès large, traçabilité nominale.

### Trois rôles Postgres

| Rôle            | Population              | Jeton                            |
| --------------- | ----------------------- | -------------------------------- |
| `anon`          | formulaires publics     | aucun (ADR 0001)                 |
| `authenticated` | collaborateurs d'agence | Supabase Auth                    |
| `porteur_lien`  | garant, locataire       | jeton de capacité signé par nous |

La frontière est portée par le **rôle Postgres**, pas par un claim lu dans une politique. Une
politique écrite `to authenticated` est inatteignable par un porteur de lien quelle que soit
l'erreur commise dans sa clause `using`. C'est la même défense en profondeur que celle qui a motivé
l'ADR 0001, appliquée à la séparation des populations.

**On prend donc Supabase Auth : pour l'agence seulement.** L'ADR 0001 l'avait pressenti. Il apporte
le lien magique, OAuth Google et Microsoft (les agences tournent sur Workspace ou M365), le MFA, et
SAML le jour où un réseau l'exigera. Le réécrire serait des mois sans un gramme de différenciation.

Le modèle par capacité du garant et du locataire est **inchangé** : ils n'ont pas de compte, et n'en
auront pas.

### Pas de mot de passe

Lien magique et OAuth. Cohérent avec la marque, zéro ticket de réinitialisation : ce qui compte à
deux, et surtout l'adresse est vérifiée par construction, ce dont le rattachement par domaine a
besoin pour être sûr.

### Le rattachement par domaine

`marie@agence-lyon3.fr` s'inscrit ; si quelqu'un de `agence-lyon3.fr` a déjà un espace, elle le
rejoint au lieu d'en créer un double. L'adoption démarre par un négociateur curieux, jamais par le
directeur : sans ce mécanisme, une agence de huit personnes produit huit espaces isolés.

Conséquence directe : **il n'y a pas de table d'invitations.** Le domaine _est_ l'invitation. Une
invitation explicite ne deviendra nécessaire que pour une adresse d'un autre domaine : un
administrateur de réseau, en phase 4.

Et corollaire tarifaire, qui n'est pas négociable : **les collaborateurs sont illimités et
gratuits.** Le prix est à l'acte (`tarifAgence`) ; chaque siège supplémentaire produit des dossiers,
donc du revenu. Facturer au siège reviendrait à faire payer un client pour apporter du chiffre.

### La vérification

SIREN, contrôlable par l'API Sirene, gratuite et publique. Et **numéro de carte professionnelle
« Gestion immobilière »** (loi Hoguet) : une agence qui fait de la gestion locative en détient une.
Elle se déclare et se contrôle par sondage, faute de registre national ouvert et requêtable.

Trois bénéfices d'un seul geste : un argument commercial (« toutes les agences sont vérifiées »,
adressé au garant, qui est celui qui doit céder ses documents), un alignement réglementaire
défendable puisqu'on manipule des pièces financières de tiers, et un filtre qui coûte peu.

Pendant le pilote (vingt agences, trois villes, six mois) la vérification est **manuelle**, faite
depuis le tableau de bord Supabase. À la sortie du pilote, on automatise SIREN et carte pro sans
toucher à l'architecture : même chemin de code, défaut inversé. On ne construit pas
« l'invitation seule » pour la remplacer ensuite.

## Ce que cette décision ne tranche pas

**Le format exact du jeton de capacité.** La vérification faite pour cet ADR confirme le chemin :
Supabase accepte des JWT signés par une **clé de signature importée**, et le claim `role` peut
désigner un rôle Postgres qu'on a créé soi-même : `porteur_lien` en l'occurrence. Restent la durée
de vie, la révocation (`jti`), et ce que le lien porte réellement. Phase 3.

**Le chiffrement des pièces**, toujours ouvert depuis l'ADR 0001. Tâche 13.

**Les réseaux.** Le domaine est unique par agence : les franchises d'un même réseau partageant
`@reseau.fr` atterriraient toutes dans une seule agence. Pour vingt agences indépendantes en pilote,
c'est sans effet ; c'est exactement là que la notion de réseau apparaîtra. Aucune colonne n'est
posée d'avance : ajouter un `reseau_id` nullable plus tard est un `alter table` sans douleur, et la
difficulté réelle sera de séparer des franchises déjà fusionnées, ce qu'une colonne prématurée ne
préviendrait pas.

**Un dossier réutilisable pour le garant.** Un garant qui se porte caution pour deux enfants, un
locataire qui déménage tous les deux ans : il y a là un produit, peut-être plus gros que celui-ci.
Une autre GTM, un autre modèle de données, et le construire maintenant tuerait le coin d'entrée
B2B. On garde la porte ouverte en ne la murant pas.

## Conséquences

- L'authentification des agences passe de la phase 4 à la phase 3, avec les liens d'accès.
- Le dossier de démonstration devient une brique de phase 3, pas un accessoire : sans lui,
  l'inscription ouverte ne mène à rien.
- La limitation de débit en mémoire de `app/agences/action.ts` garde son signal de sortie inchangé
  (voir `docs/dettes.md`) : les liens d'accès de la phase 3.
- La vérification manuelle est un travail récurrent pendant six mois. C'est assumé : c'est aussi
  vingt conversations avec les vingt premiers clients.
- `statut` et `verifiee_le` ne sont accessibles par aucune API, y compris à un administrateur
  d'agence. La RLS ne sachant pas restreindre une colonne, c'est un `grant update (…)` nominatif qui
  le garantit.

## Alternatives écartées

**Tout en jetons maison, y compris l'agence** : cohérent, un seul émetteur, mais il faudrait écrire
la connexion, la vérification d'adresse, la révocation, le MFA, puis SAML. Des mois de travail sur
un problème résolu, et un système d'authentification maison à maintenir sur un produit qui vend la
confidentialité.

**Supabase Auth pour les trois acteurs** : trahit la promesse affichée sur la page d'accueil. Le
« pas de compte » n'est pas une commodité, c'est ce qui fait que le garant va au bout du dépôt.

**Inscription sur invitation seule** : confortable pour le pilote, mais met ta boîte mail au milieu
du tunnel d'acquisition, et se remplace par de l'auto-inscription au pire moment : celui où ça
décolle. Le drapeau d'activation donne le même contrôle sans la dette.

**Vérification par pièce justificative (Kbis déposé)** : plus lourd pour l'agence, sans rien
apporter de plus que SIREN et carte pro, qui sont exactement les deux registres que la profession
tient déjà.
