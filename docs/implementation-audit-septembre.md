# Implementation de l'audit du 8 septembre 2026

Lounes autorise les corrections, PR, fusions et livraisons. Universign, le modele
contractuel et les validations non techniques restent de son cote. Une fonction
dependant de ces elements reste fermee tant que ses conditions ne sont pas reunies.

## Ordre de livraison

| Lot | Perimetre                                                                                                      | Etat                                                      |
| --- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | F01 formulaires lies au dossier affiche ; F07 confirmation des lignes ecrites                                  | Tests cibles verts, livraison en cours                    |
| 2   | F02 expiration des acces agence ; F19 dernier administrateur ; F14 debit documentaire                          | A implementer avec nouvelle migration et repetition cible |
| 3   | F03 unite du plafond ; F04 centimes ; F05 version des conditions ; F06 controle indicatif de mention           | A implementer                                             |
| 4   | F08 renouvellement et deconnexion des porteurs                                                                 | A implementer                                             |
| 5   | F09 supervision de cadence ; F10 budgets de maintenance ; F11 et F12 livraison des liens et courriels          | A implementer                                             |
| 6   | F13 limites des documents ; F14 processus et quotas                                                            | A implementer                                             |
| 7   | F15 chaine contractuelle et adaptateur ; F16 sauvegarde et rotation ; F22 rapprochement des paiements          | A implementer, activation fournisseur distincte           |
| 8   | F17 pages d'information ; F18 pagination ; F19 gestion des membres ; F20 parcours ; F21 complements et profils | A implementer                                             |

Les idees produit du rapport sont des ajouts a concevoir avec les regles d'acces
et les obligations applicables, pas des fonctions declarees livrees par ce tableau.
La signature et les textes juridiques exigeront les elements prepares par Lounes.

## Lot 1

Les huit actions des porteurs refusent un formulaire dont le dossier ne correspond
pas a la capacite courante, avant tout client metier ou traitement documentaire.
Le champ cache ne donne aucun droit : le jeton et les politiques SQL restent requis.
Tous les formulaires des pages locataire et garant transportent ce contexte.

Engagement, mention et loyer exigent une ligne retournee par PostgREST avant
d'annoncer le succes. La lecture prealable de l'engagement refuse aussi une panne.
Les tests reproduisent les refus inter-onglets, le contexte absent et les mises
a jour de zero ligne. Les cas autorises avec une ligne retournee restent couverts.
17 contre-preuves observees rouges ; 20 tests d'actions verts et 14 tests de pages.
Pas de migration SQL dans ce lot. Les ecritures avec retour utilisent les droits
de lecture deja accordes au meme porteur.

## Presentation publique

PR 57 fusionnee le 8 septembre, commit a6b306e. La signature est presentee comme
indisponible et les CTA publics conduisent a l'ouverture du dossier. CI de main
34206374189 suivie apres fusion.
