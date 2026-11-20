/**
 * Les textes anglais des formulaires du site public : ouverture d'un dossier,
 * dossier a retrouver, connexion agence, demande de demonstration.
 */
export const porte = {
  titre: 'Create your file',
  sousTitre:
    'One email address, and you get a link. No account, no password: the link is your key.',
  champ: 'Your email address',
  exemple: 'you@example.com',
  aide: 'Your link will arrive by email. Check your spam folder too.',
  bouton: 'Open my file',
  envoi: 'Opening…',
  succesTitre: 'Check your inbox.',
  succesTexte:
    'If the request could be processed, you will receive a link valid for seven days. Keep it to find your file again.',
} as const

export const avantOuverture =
  'Check with your agency that it accepts a Cloison file before you pay for yours.'

export const informationCollecte = {
  locataire:
    'Your address is used to send you your link and to follow your file, which is deleted three months after it is opened at the latest.',
  lien: 'What we do with it',
} as const

export const connexion = {
  succes: 'Check your inbox.',
  envoye:
    'If this address can open a space, a link has just been sent. It is valid for one hour, and only once.',
  expire: 'This link has expired or has already been used. Request a new one.',
  email: 'Your work address',
  exemple: 'firstname@your-agency.com',
  aide: 'It links your account to your agency. A personal Gmail or Outlook address cannot open a space.',
  envoi: 'Sending…',
  recevoir: 'Send me my link',
} as const

export const continuite = {
  retrouver: 'Find my file',
  email: 'Your email address',
  reference: 'File reference received by email',
  envoyer: 'Send me a new link',
  resultat:
    'If these details match a file that is still active, a new link will be sent to its address.',
  erreur: 'This did not go through. Check the details and try again.',
} as const

export const demande = {
  nom: 'Agency name',
  nomExemple: 'Bellevue Lettings',
  ville: 'City',
  villeExemple: 'Lyon',
  email: 'Work email',
  emailExemple: 'contact@bellevue-lettings.com',
  volume: 'Rental files per year',
  volumes: {
    'moins-de-10': 'Fewer than 10',
    '10-50': '10 to 50',
    '50-200': '50 to 200',
    'plus-de-200': 'More than 200',
  } as Record<string, string>,
  message: 'A word about how you work',
  facultatif: '(optional)',
  messageExemple: 'Which signing tool do you use? Where does the guarantee get stuck today?',
  siteWeb: 'Website',
  envoi: 'Sending…',
  bouton: 'Request a demo →',
  collecte:
    'These details are only used to get back to you about Cloison. They are neither sold nor used for third-party marketing, and they are kept for as long as it takes to handle your request. To access, correct or delete them, simply reply to the email you will receive.',
  merci: 'Noted.',
  suite:
    'We will get back to you within 48 business hours, with a demo on a real file: not a brochure.',
} as const

/**
 * Les messages que les actions serveur renvoient en francais, et leur version
 * anglaise. Un message inconnu retombe sur `defaut`.
 */
const messageDefaut = 'This did not go through. Check the form and try again.'

export const messagesServeur: Record<string, string> = {
  'Ton adresse e-mail est requise.': 'Your email address is required.',
  'Cette adresse est trop longue.': 'This address is too long.',
  'Cette adresse ne ressemble pas a une adresse e-mail.':
    'This does not look like an email address.',
  'Cette adresse ne ressemble pas à une adresse e-mail.':
    'This does not look like an email address.',
  'Cette adresse est invalide.': 'This address is not valid.',
  'Trop de dossiers ouverts depuis cette connexion. Réessaie dans une heure.':
    'Too many files opened from this connection. Try again in an hour.',
  "Le dossier n'a pas pu être ouvert. Réessaie dans un instant.":
    'The file could not be opened. Try again in a moment.',
  'Votre adresse professionnelle est requise.': 'Your work address is required.',
  'Trop de tentatives. Réessayez dans quelques minutes.':
    'Too many attempts. Try again in a few minutes.',
  'Adresse e-mail incomplète.': 'Incomplete email address.',
  'Adresse e-mail trop longue.': 'Email address too long.',
  'Utilisez votre adresse professionnelle, pas une adresse personnelle.':
    'Use your work address, not a personal one.',
  "Le nom de l'agence est trop court.": 'The agency name is too short.',
  "Le nom de l'agence est trop long.": 'The agency name is too long.',
  'Ville trop courte.': 'City name too short.',
  'Ville trop longue.': 'City name too long.',
  'Choisissez un volume.': 'Choose a volume.',
  'Message trop long (2000 caractères maximum).': 'Message too long (2,000 characters maximum).',
  'Quelques champs sont à corriger.': 'A few fields need correcting.',
  "Nous n'avons pas pu enregistrer votre demande. Réessayez dans un instant.":
    'We could not save your request. Try again in a moment.',
}

/** Le message d'une action serveur dans la langue de la page. */
export function messageEn(message: string | undefined): string | undefined {
  return message === undefined ? undefined : (messagesServeur[message] ?? messageDefaut)
}
