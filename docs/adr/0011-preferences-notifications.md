# 0011. Preferences personnelles de suivi

Chaque membre choisit Tous les dossiers, Mes dossiers ou Aucun courriel de suivi.
Le comportement existant reste le choix par defaut. Seuls les destinataires
agence des notifications de statut sont filtres lors de leur preparation :
dossier complet, garant insuffisant et complement fourni. Aucun message Auth,
de securite, de paiement ou destine aux porteurs n'est desactive par ce choix.

La preference appartient a la personne et reste inaccessible aux autres membres,
y compris l'administrateur. La fonction SQL derive l'identite de la session avec
MFA ; elle n'accepte aucun identifiant de destinataire fourni par le client. Une
revision refuse les formulaires anciens. Le verrou d'appartenance serialise les
changements et l'exclusion. Le depart supprime la preference par cle etrangere.

Le choix Mes dossiers s'appuie sur l'affectation actuelle au moment de preparer
la notification. Il ne reprogramme pas un evenement acquitte. La file chiffree,
les clefs de deduplication et les bornes de reprise ne changent pas.

Les messages deja prepares peuvent encore arriver : le reglage ne peut pas
reprendre un message remis au fournisseur ni identifier les destinataires d'un
contenu deja chiffre sans changer le contrat de la file. Cette limite est
affichee avant validation. Ce lot ne cree aucune relance automatique.

Voir [le guide](../exploitation/preferences-notifications.md).
