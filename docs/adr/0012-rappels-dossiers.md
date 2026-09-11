# 0012. Rappels facultatifs et valides au moment de l'envoi

L'administrateur peut activer une relance du garant apres 3, 7 ou 14 jours sans
modification, et une alerte agence 3 ou 7 jours avant l'echeance du dossier.
Les deux reglages sont desactives par defaut. La session MFA, l'appartenance et
le role administrateur sont verifies en SQL ; une revision refuse les formulaires
anciens. Les autres membres ne peuvent ni lire ni modifier ces reglages.

La relance concerne un depot incomplet ou un complement encore demande. Les
changements de statut, destinataire, pieces, engagement et complements changent
la revision et la date d'activite. Trois relances maximum sont programmees par
dossier, avec trois jours minimum entre deux relances ; une activite recente
reporte la prochaine selon le delai choisi. Les alertes d'echeance respectent les
preferences personnelles et l'affectation courante, avec une alerte par membre
et echeance. Refus, signature, expiration, demonstration et agence non verifiee
interdisent les rappels. Aucun lien de capacite n'est cree ni prolonge.

La maintenance programme au plus 20 rappels par passage, 50 par agence et 200
globalement sur 24 heures. Un verrou transactionnel global serialise le comptage
et l'insertion. Les plafonds comptent les programmations, y compris celles
devenues obsoletes, pour ne pas ouvrir un contournement par annulation.

Le registre prive conserve des identifiants, dates et empreintes d'adresse, jamais
les pieces, motifs, montants ou liens. Le contenu du courriel est chiffre avec le
trousseau serveur. Une cle etrangere detruit la file associee quand le dossier est
supprime. Chaque rappel expire au plus tard apres 24 heures ou a l'echeance du
dossier. La meme identite de courriel preserve l'idempotence fournisseur.

La validite est reverifiee avant preparation, prise de bail et juste avant le
dechiffrement et l'appel fournisseur. Un rappel obsolete est annule et son contenu
efface. Un bail absent, different ou sans echeance valable ne peut confirmer un
envoi. La verification SQL et le transport HTTP restent deux operations : un
changement intervenu pendant l'appel fournisseur ne peut pas rappeler le message.
Cette limite est affichee dans les reglages.

La phase de rappels a un budget propre de six secondes. Sa panne ne bloque ni la
purge ni les courriels ordinaires et rend la maintenance en echec agrege. La
cadence du planificateur et les quotas ne garantissent pas une heure de livraison.
La migration 0052 precede le deploiement du code. Elle enrichit la projection de
la file d'un identifiant nullable que l'ancien transport ignore ; les reglages
restent desactives pendant cette transition.

Voir [le guide](../exploitation/rappels-dossiers.md).
