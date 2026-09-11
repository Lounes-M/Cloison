# ADR 0013 : suivre les demandes de droits sans recopier leur contenu

## Decision

Un registre prive relie des etapes immuables par demande aleatoire. Correspondance
et verification d'identite restent dans l'outil operateur. Chaque etape conserve
une empreinte, des dates explicites et une revision precedente. Chaine unique,
verrou transactionnel par demande et rejeu strict evitent les doubles inscriptions
et l'ecrasement d'une decision concurrente.

Aucune route produit ni lecture API n'est ajoutee. Deux CLI inscrivent et consultent
le suivi. Le serveur declenche seulement la purge de cent demandes expirees.
L'echeance de la derniere etape vaut pour toute la chaine ; le controle est refait
apres acquisition du verrou.

## Consequences

Dates legales et conservation restent des decisions humaines explicites. Les
statuts ne prouvent pas l'execution d'un droit. Export et effacement individuels
restent distincts. Le proprietaire de la base appartient au modele de confiance ;
son compte est impose, mais l'identite operateur est declaree.

Voir [la procedure](../rgpd/droits-des-personnes.md) pour les references CNIL et
[le guide](../exploitation/suivi-demandes-droits.md) pour les limites operationnelles.
