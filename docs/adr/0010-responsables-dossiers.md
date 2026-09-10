# 0010. Un responsable pour organiser le suivi des dossiers

## Decision

Une affectation interne lie un dossier a un membre de son agence. Elle ne change
aucun droit sur les justificatifs, aucun statut du dossier et aucune decision.
Un administrateur peut attribuer ou liberer un dossier. Un membre peut prendre
un dossier libre et liberer uniquement le sien.

La fonction SQL exige une session agence avec MFA, un destinataire confirme du
domaine de l'agence, un dossier encore ouvert au traitement et non expire. Les
ecritures directes sont interdites aux roles applicatifs. Une revision attendue
refuse les formulaires devenus anciens. Le verrou du membre precede celui du
dossier pour coordonner affectation et exclusion.

Le retrait d'un collaborateur libere ses dossiers. Une suppression Auth invalide
aussi les revisions, y compris lorsque la cle etrangere remet directement le
responsable a null. Les dossiers supprimes emportent leur affectation.

## Consultation

L'agence filtre ses dossiers par etat, responsable courant ou absence de
responsable avant la pagination. La projection des noms est limitee aux cinquante
dossiers affiches ; les adresses hors domaine ne sont pas exposees. Les choix de
collaborateurs sont pagines. Aucun nom de responsable ne rejoint le connecteur
externe ou les parcours du locataire et du garant.

## Limites

Il n'y a ni notification automatique, ni affectation multiple, ni historique des
reaffectations. La responsabilite est une aide au suivi et ne constitue pas une
restriction de consultation entre membres d'une meme agence.

Voir [le guide d'exploitation](../exploitation/responsables-dossiers.md).
