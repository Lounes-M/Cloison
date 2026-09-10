# ADR 0007 : aide a la lecture externe sur demande

## Decision

Lounes demande l'OCR et impose OpenRouter pour l'IA le 10 septembre 2026.
Une agence authentifiee avec MFA peut demander la transcription d'une piece
qu'elle est deja autorisee a consulter. La fonctionnalite est facultative et
desactivee par defaut. L'action exige une information explicite sur l'envoi.

Le serveur utilise le chemin d'ouverture habituel : controle SQL, journal,
dechiffrement, rasterisation et filigrane. Seule cette copie est envoyee a
OpenRouter, sous forme de contenu embarque et avec un nom de fichier neutre.
Aucun lien de coffre, cle de dossier ou identifiant metier n'est transmis.
Le document peut contenir des donnees personnelles : elles deviennent lisibles
par le fournisseur pendant ce traitement. Le chiffrement au repos du coffre
ne couvre pas cette copie externe en cours de traitement.

La demande impose les options ZDR, refus de collecte, PDF natif et absence de
repli automatique. L'information aux personnes, les conditions de sous-traitance,
les reglages de journalisation du compte et la region effective doivent etre
traites avant activation sur des donnees reelles. Ces options techniques ne
constituent pas une validation juridique ni une garantie de residence UE.

## Limites de l'IA

Le modele transcrit ; il ne dispose d'aucun outil et ne modifie aucun dossier.
Le texte du document est une entree non fiable, y compris ses instructions.
La sortie est bornee, validee structurellement et affichee comme texte inerte.
Une extraction ne certifie ni authenticite, ni revenu, ni solvabilite. Aucun
score, acceptation ou refus n'est calcule a partir de cette sortie.

## Conservation et cout

La transcription n'est pas persistee dans Cloison. Les reponses ne sont pas
mises en cache ; le panneau efface son etat a la fermeture ou au masquage.
Le journal nominatif conserve uniquement la tentative, sans texte OCR. Les
compteurs partages bornent le nombre de demandes. Un plafond monetaire de cle
OpenRouter reste a configurer : un quota de requetes n'est pas un budget en euros.

Les ADR 0002 a 0004 restent applicables au stockage, aux droits et au rendu.
La presente decision ajoute ce transfert facultatif, sans ouvrir les documents
au locataire, aux connecteurs immobiliers ou a un agent autonome.
