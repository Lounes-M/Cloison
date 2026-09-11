# ADR 0008 : integrations limitees aux statuts

## Decision

Decision du 10 septembre 2026 : privilegier un contrat commun d'integration.
Le premier contrat est une API HTTPS commune, en lecture seule, documentee par
`public/connecteurs-openapi.json`. Un integrateur peut l'utiliser avec son
logiciel ou un outil d'automatisation HTTP. Les adaptateurs propres aux editeurs
restent a realiser avec leurs acces et leur contrat partenaire.

Chaque agence cree ses acces depuis une session administrateur avec MFA. Une
cle aleatoire de 256 bits n'est montree qu'a la creation ; seule son empreinte
SHA-256 est stockee. Le secret est envoye exclusivement dans Authorization,
jamais dans une URL. Il expire apres 90 jours et peut etre revoque immediatement.
L'exclusion du createur le revoque definitivement, meme apres readmission.

Le serveur appelle une fonction SQL reservee au role serveur. Elle verifie la
cle, l'agence et l'identite actuelle du createur avant chaque lecture. Elle ne
rend que reference et etat neutre, sans piece, adresse, montant, ratio, resultat
OCR ou identifiant interne. La sortie est validee strictement une seconde fois
dans l'API ; une projection enrichie accidentellement est refusee.

Les plafonds sont cinq cles actives, vingt creations par jour et par agence,
et soixante lectures par minute et par cle. Les reservations sont serialisees
dans PostgreSQL. La pagination lexicographique rend cinquante dossiers au plus.
Il s'agit de parcours periodiques de l'etat courant, sans instantane transactionnel
entre les pages ni journal exhaustif des changements.

## Limites

Un logiciel qui recoit une reference et un statut peut les conserver. La
revocation interdit les prochaines lectures et ne retire pas ses copies.
L'absence d'un dossier ne prouve pas sa destruction. Le statut pret signifie
presence des pieces attendues et ne certifie ni authenticite ni solvabilite.

Ce lot ne transmet rien spontanement a un editeur et n'ouvre aucune URL fournie
par un client. Aucun compte Apimo, WHISE ou autre partenaire n'est connecte.
Leur integration necessite l'acces, la correspondance des references et une
validation du parcours de bout en bout. Le contrat commun reduit le couplage
aux editeurs sans pretendre remplacer ces travaux.
