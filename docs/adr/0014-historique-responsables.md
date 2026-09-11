# ADR 0014 : tracer les affectations sans recopier les identites

## Decision

Un declencheur inscrit uniquement les changements effectifs de membre dans un
registre interne. La revision d'affectation rend chaque evenement unique. Le
registre conserve les UUID, la revision et la date ; les adresses sont jointes
sur les membres admissibles actuels au moment de la lecture.

Une fonction AAL2 limite la lecture a l'agence du dossier et a son echeance.
Elle utilise un curseur de date et UUID, cinquante lignes et une sentinelle.
Aucun role applicatif n'accede directement a la table. Le panneau serveur rend
le resultat sous forme de texte et isole une indisponibilite de l'historique.

## Consequences

Pas de reconstitution du passe ni de changement des droits documentaires.
Le depart Auth reste possible : les UUID historiques ne portent pas de FK Auth
qui modifierait le journal. Le proprietaire PostgreSQL reste dans le modele de
confiance. Une action technique sans membre agence est identifiee comme telle.

Le dossier porte la retention, meme quand un acte signe survit a son echeance.
La purge de maintenance est bornee a mille lignes et reprend les echecs.
Voir le [guide operateur](../exploitation/historique-responsables.md).
