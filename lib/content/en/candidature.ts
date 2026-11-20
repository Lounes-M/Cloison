import type { Textes } from '@/lib/i18n'
import type { candidature as Fr } from '../candidature'

/** Le lien de candidature d'un logement, en anglais. */
export const candidature: Textes<typeof Fr> = {
  agence: {
    titre: 'Application link',
    aide: 'Paste this link into your listing. The applicant who uses it opens their Cloison file, which joins this property and your agency directly, with their consent. The page shows only the name of the property, the rent and the name of the agency.',
    nonVerifiee:
      'The application link opens once your agency is verified: the applicant must know who they are sending their file to.',
    ferme: 'No link open for this property.',
    champ: 'Link to share',
    ouvrir: 'Open an application link',
    renouveler: 'Change the link',
    renouvelerAide: 'Changing the link makes the old one unusable.',
    fermer: 'Close the link',
    archive: 'The link closes by itself when the property is archived.',
    copier: 'Copy the link',
    copie: 'Link copied.',
    copieImpossible: 'The copy failed. Select the link and copy it by hand.',
    messageTitre: 'Message to send to applicants',
    messageAide:
      'A text ready to paste into your listing or your replies to applicants. Adapt it if needed.',
    message: (libelle, lien) =>
      `Hello,\n\nTo apply for the property “${libelle}”, create your rental file on Cloison: ${lien}\n\nYou will receive a link by email, with no account and no password. Your guarantor will upload their supporting documents separately, and the file will reach us with your consent.\n\nKind regards`,
    copierMessage: 'Copy the message',
    messageCopie: 'Message copied.',
    messageCopieImpossible: 'The copy failed. Select the message and copy it by hand.',
  },
  description: {
    titre: 'Description of the property',
    aide: 'This information is shown on the application link page. All of it is optional. Describe only the property, never the owner or the current occupant.',
    ville: 'City or neighbourhood',
    villeAide: 'For example “Lyon 7e”. Avoid the exact address.',
    surface: 'Floor area (m²)',
    pieces: 'Number of rooms',
    meuble: 'Furnishing',
    meubleInconnu: 'Not specified',
    meubleOui: 'Furnished',
    meubleNon: 'Unfurnished',
    disponible: 'Available from',
    bouton: 'Save the description',
    envoi: 'Saving…',
    succes: 'Description saved.',
    erreurs: {
      ville: 'The city must be 80 characters at most.',
      surface: 'The floor area is given in whole square metres, between 5 and 1000.',
      pieces: 'The number of rooms ranges from 1 to 20.',
      date: 'The availability date cannot be read.',
    },
  },
  page: {
    titre: 'Apply for this home',
    apercuTitre: (libelle, agence) => `${libelle}, with ${agence}`,
    apercuTexte: (agence) =>
      `Create your rental file on Cloison and send it to ${agence} for this home.`,
    etiquette: 'Application',
    loyer: 'Reference rent',
    sansLoyer: 'Not provided',
    agence: 'Agency',
    ville: 'City',
    surface: 'Floor area',
    pieces: 'Rooms',
    meuble: 'Furnishing',
    meubleOui: 'Furnished',
    meubleNon: 'Unfurnished',
    disponible: 'Available',
    disponibleDes: 'Now',
    intro: (agence) =>
      `Create your Cloison file: it will be sent to ${agence} for this home, and to nobody else.`,
    accord: (agence) =>
      `I allow ${agence} to view the information and documents in my file for this home. This link to the agency is permanent.`,
    dejaTitre: 'Already have a file?',
    dejaTexte:
      'Open your space with the link you received by email, then paste this link or its code in the “Apply for a home” section.',
    code: 'Application code',
    rattache: 'Your file has joined this home. Open the link you received by email to complete it.',
    nonRattache:
      'Your file is open, but it could not join this home. From your space, paste the listing link in the “Apply for a home” section.',
    invalideTitre: 'This link no longer works',
    invalideTexte:
      'The home may have been let, or the agency may have changed its link. Ask them for the current link, or create your file without an agency: you can send it to them later.',
    invalideBouton: 'Create my file',
  },
  espace: {
    titre: 'Apply for a home',
    aide: 'Paste the application link from the listing, or just its code. Your file will join this home and its agency.',
    champ: 'Application link or code',
    consentement:
      'I allow the agency for this home to view the information and documents in my file. This link to the agency is permanent.',
    bouton: 'Apply',
    envoi: 'Sending…',
    succes: (agence) => `Your file has been sent to ${agence} for this home.`,
    erreur:
      'This application did not go through. Check the link: it may have been closed, or your file is already handled by another agency.',
    accord: 'Tick the consent box to send your file.',
  },
  erreurs: {
    accord: 'Tick the consent box so your file can join this home.',
  },
}
