/**
 * Les messages que le serveur ecrit en francais, et leur version anglaise.
 *
 * La cle est la phrase francaise exacte, telle qu'elle nait dans un schema, une
 * action ou le coffre : `traducteur` (lib/messages.ts) s'en sert au moment de
 * la renvoyer. Un test parcourt les actions et echoue si une phrase manque ici.
 */
export const messageDefaut = 'This did not go through. Check the form and try again.'

export const messagesServeur: Record<string, string> = {
  // Adresses e-mail
  'Ton adresse e-mail est requise.': 'Your email address is required.',
  'Votre adresse professionnelle est requise.': 'Your work address is required.',
  "L'adresse du locataire est requise.": 'The tenant’s address is required.',
  "L'adresse de ton garant est requise.": 'Your guarantor’s address is required.',
  'Cette adresse est trop longue.': 'This address is too long.',
  'Cette adresse ne ressemble pas a une adresse e-mail.':
    'This does not look like an email address.',
  'Cette adresse ne ressemble pas à une adresse e-mail.':
    'This does not look like an email address.',
  'Cette adresse est invalide.': 'This address is not valid.',
  'Adresse invalide.': 'This address is not valid.',
  "Cette adresse e-mail n'est pas valide.": 'This email address is not valid.',
  'Adresse e-mail incomplète.': 'Incomplete email address.',
  'Adresse e-mail trop longue.': 'Email address too long.',
  'Utilisez votre adresse professionnelle, pas une adresse personnelle.':
    'Use your work address, not a personal one.',

  // Demande d'une agence
  "Le nom de l'agence est trop court.": 'The agency name is too short.',
  "Le nom de l'agence est trop long.": 'The agency name is too long.',
  'Ville trop courte.': 'City name too short.',
  'Ville trop longue.': 'City name too long.',
  'Choisissez un volume.': 'Choose a volume.',
  'Message trop long (2000 caractères maximum).': 'Message too long (2,000 characters maximum).',
  'Quelques champs sont à corriger.': 'A few fields need correcting.',
  "Nous n'avons pas pu enregistrer votre demande. Réessayez dans un instant.":
    'We could not save your request. Try again in a moment.',

  // Debit
  'Trop de dossiers ouverts depuis cette connexion. Réessaie dans une heure.':
    'Too many files opened from this connection. Try again in an hour.',
  'Trop de tentatives. Réessayez dans quelques minutes.':
    'Too many attempts. Try again in a few minutes.',
  'Trop de liens envoyés. Réessaie dans un quart d’heure.':
    'Too many links sent. Try again in fifteen minutes.',

  // Sessions et liens
  'Session expirée.': 'Your session has expired.',
  'Saisie invalide.': 'This entry is not valid.',
  'Ton lien a expiré. Demande-en un nouveau.': 'Your link has expired. Ask for a new one.',
  'Votre lien a expiré. Demandez au locataire de vous le renvoyer.':
    'Your link has expired. Ask the tenant to send it to you again.',

  // Dossiers
  "Le dossier n'a pas pu être ouvert. Réessaie dans un instant.":
    'The file could not be opened. Try again in a moment.',
  "Le dossier n'a pas pu être ouvert. Réessayez dans un instant.":
    'The file could not be opened. Try again in a moment.',
  "Votre agence n'est pas encore vérifiée : l'ouverture d'un dossier pour un vrai locataire attend la vérification.":
    'Your agency is not verified yet: opening a file for a real tenant has to wait for verification.',
  'Dossier inconnu.': 'Unknown file.',
  "Ce dossier n'est pas complet, ou n'est plus le vôtre.":
    'This file is not complete, or is no longer yours.',
  'Ce dossier ne peut pas être refusé dans son état actuel.':
    'This file cannot be declined in its current state.',
  'Le seuil se lit entre 1 et 10, avec au plus deux décimales.':
    'The threshold is a number between 1 and 10, with two decimals at most.',
  'Seul un administrateur de l’agence peut modifier le seuil.':
    'Only an agency administrator can change the threshold.',
  'Seul un administrateur de l’agence peut demander l’activation.':
    'Only an agency administrator can request activation.',
  'Le SIREN fait neuf chiffres.': 'A SIREN number has nine digits.',
  'Le numéro de carte professionnelle est trop court.':
    'The professional licence number is too short.',
  'Le numéro de carte professionnelle est trop long.':
    'The professional licence number is too long.',
  "L'enregistrement n'a pas abouti. Réessayez dans un instant.":
    'This could not be saved. Try again in a moment.',
  "L'enregistrement n'a pas abouti. Réessaie dans un instant.":
    'This could not be saved. Try again in a moment.',

  // Locataire
  'Le loyer ne se lit pas. Exemple : 850 ou 850,50.':
    'This rent cannot be read. Example: 850 or 850.50.',
  'Règle d’abord ton dossier, plus haut : le lien de ton garant partira ensuite.':
    'Pay for your file first, above: your guarantor’s link will be sent right after.',
  'Ton garant ne peut pas être toi-même.': 'You cannot be your own guarantor.',
  'Ton garant a déjà commencé son dossier : son adresse ne peut plus changer. Tu peux lui renvoyer son lien.':
    'Your guarantor has already started their file: their address can no longer change. You can send them their link again.',
  'Le lien n’a pas pu être préparé. Réessaie dans un instant.':
    'The link could not be prepared. Try again in a moment.',
  "Le lien n'a pas pu être envoyé. Vérifie l'adresse et réessaie.":
    'The link could not be sent. Check the address and try again.',

  // Garant
  'Votre nom est requis.': 'Your last name is required.',
  'Votre prénom est requis.': 'Your first name is required.',
  'Votre adresse est requise.': 'Your address is required.',
  'La mention est trop courte pour contenir ce que la loi exige.':
    'The statement is too short to contain what the law requires.',
  'La mention est trop longue.': 'The statement is too long.',
  'Enregistrez d’abord un montant maximum dans la partie consacrée à votre engagement.':
    'First save a maximum amount in the section about your commitment.',
  'Il manque quelque chose à votre mention.': 'Something is missing from your statement.',

  // Coffre
  'Nature de pièce inconnue.': 'Unknown document type.',
  'Pièce inconnue.': 'Unknown document.',
  'Choisissez un fichier.': 'Choose a file.',
  'Ce fichier dépasse 4 Mo. Une photo moins lourde ou un PDF plus léger passera.':
    'This file is larger than 4 MB. A lighter photo or a smaller PDF will go through.',
  'Ce document est invalide, protégé ou trop grand. Exportez une copie lisible de moins de 40 pages.':
    'This document is invalid, protected or too large. Export a readable copy of fewer than 40 pages.',
  "Le dépôt n'a pas abouti. Réessayez dans un instant.":
    'The upload did not go through. Try again in a moment.',
  "Le retrait n'a pas abouti. Réessayez dans un instant.":
    'The document could not be removed. Try again in a moment.',
  "Cette pièce n'existe pas, ou vous n'y avez pas accès.":
    'This document does not exist, or you do not have access to it.',
  "Cette pièce n'a pas pu être ouverte. Réessayez dans un instant.":
    'This document could not be opened. Try again in a moment.',
  'Cette pièce ne peut plus être retirée : le dossier est parti à l’agence.':
    'This document can no longer be removed: the file has been sent to the agency.',
  'Ce fichier est vide.': 'This file is empty.',
  'Ce fichier dépasse 20 Mo. Réduisez sa taille ou déposez-le en plusieurs fois.':
    'This file is larger than 20 MB. Reduce its size or upload it in several parts.',
  'Ce fichier est un document bureautique (Word, Excel, OpenDocument). Exportez-le en PDF avant de le déposer.':
    'This file is an office document (Word, Excel, OpenDocument). Export it as a PDF before uploading it.',
  'Ce fichier est un ancien document Office. Ouvrez-le et enregistrez-le en PDF avant de le déposer.':
    'This file is an older Office document. Open it and save it as a PDF before uploading it.',
  'Ce fichier est un document RTF. Exportez-le en PDF avant de le déposer.':
    'This file is an RTF document. Export it as a PDF before uploading it.',
  'Ce fichier est une image GIF. Déposez plutôt une photo JPEG ou PNG, ou un PDF.':
    'This file is a GIF image. Upload a JPEG or PNG photo, or a PDF, instead.',
  'Cette photo est au format HEIC, celui des iPhone récents. Dans Réglages, Appareil photo, Formats, choisissez « Plus compatible », ou envoyez-la en PDF.':
    'This photo is in HEIC, the format of recent iPhones. In Settings, Camera, Formats, choose “Most Compatible”, or send it as a PDF.',
  'Cette photo est au format AVIF. Enregistrez-la en JPEG ou en PNG avant de la déposer.':
    'This photo is in AVIF format. Save it as a JPEG or PNG before uploading it.',
  'Ce fichier est une vidéo. Le coffre attend des documents : un PDF ou une photo.':
    'This file is a video. The vault expects documents: a PDF or a photo.',
  'Ce fichier n’est ni un PDF ni une photo JPEG ou PNG. Ce sont les seuls formats que le coffre accepte.':
    'This file is neither a PDF nor a JPEG or PNG photo. These are the only formats the vault accepts.',
}
