# ADR 0009 : examen humain de chaque fichier courant

## Decision

Une agence distingue le depot d'un fichier de son examen humain. Un membre
authentifie avec MFA peut enregistrer une appreciation : a examiner, examine
lisible et complet, ou a revoir. La confirmation explicite engage uniquement
l'appreciation de la personne. Ni OCR ni presence des fichiers ne la produisent.
Aucun statut de dossier, revenu, ratio ou decision d'acceptation n'est modifie.

L'appreciation porte sur l'identifiant exact du fichier. Chaque changement ajoute
une ligne datee avec l'acteur ; les membres ne peuvent ni modifier ni supprimer
ces lignes directement. Une revision UUID sert au controle optimiste : apres une
modification par un collegue, l'ancien formulaire est refuse et invite a recharger.
Le dossier et la piece sont verrouilles pendant l'enregistrement. Vingt changements
au maximum par piece sur vingt-quatre heures limitent la croissance de l'historique.

Une piece ecartee par une demande de complement n'est plus examinable. Le fichier
suivant exige sa propre appreciation ; il n'herite jamais d'une validation anterieure.
La consultation et l'ecriture exigent une agence autorisee et un dossier non expire.
Un dossier refuse ou signe n'accepte plus de changement d'appreciation.

## Confidentialite et conservation

L'historique est prive a l'agence. Le locataire, le garant, les connecteurs de statuts
et le fournisseur OCR ne recoivent pas ces appreciations. Aucun commentaire libre,
montant ou contenu de piece n'est enregistre dans ce journal. Le nom de l'acteur
affiche est son adresse de membre actuel ; un ancien collaborateur est presente
sans afficher son eventuelle nouvelle adresse.

Les lignes sont effacees en cascade lors de la suppression du fichier ou du dossier.
L'expiration retire la lecture avant que la purge retire les donnees. Ce journal
d'examen est distinct du journal des ouvertures et n'affirme ni authenticite du
justificatif ni verification d'identite. L'appreciation reste une decision humaine.
