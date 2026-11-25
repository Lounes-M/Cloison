import type * as Fr from '../courriels'

/**
 * Les courriels de statut, en anglais. Memes regles qu’en francais : aucun
 * lien pour le locataire ou le garant, aucun chiffre pour le locataire.
 */

export const locataire: typeof Fr.locataire = {
  complet: {
    sujet: 'Your file is complete',
    texte:
      'Your guarantor has uploaded their documents and is eligible. If an agency is following your file, it now has everything it needs to decide and will get back to you. If not, attach your file to your agency from your space so that it can view it.',
  },
  garant_insuffisant: {
    sujet: 'Your file needs another guarantor',
    texte:
      'The file will not go any further with this guarantor. To ask someone else, open a new file: this guarantor’s data stays isolated.',
  },
  transmis: {
    sujet: 'The agency has taken your file',
    texte:
      'The agency has taken your file to decide on it. Your guarantor’s documents and declaration are now frozen. You will be told what happens next.',
  },
  refuse: {
    sujet: 'Your file was not selected',
    texte:
      'The agency did not select this file. You can open a new one for another property, with another guarantor or the same one.',
  },
}

export const garant: typeof Fr.garant = {
  complement_demande: {
    sujet: 'Your agency is asking for a correction',
    texte:
      'A correction is expected in your Cloison upload. Read the request from your usual link, upload the new file, then submit it to your agency. The reason stays in your private space.',
  },
  transmis: {
    sujet: 'The agency has taken the file',
    texte:
      'The agency has taken the file you are guaranteeing. Your documents and your declaration are frozen. You can view your originals and the access history from your space. This handover is not a signature.',
  },
  refuse: {
    sujet: 'The file was not selected',
    texte:
      'The agency did not select the file you were guaranteeing. Your documents will be destroyed when the file expires; you have nothing to do.',
  },
}

export const agence: typeof Fr.agence = {
  rattache: {
    sujet: (reference) => `File ${reference} sent to your agency`,
    texte:
      'A tenant has attached their file to your agency, with their consent. Their guarantor may not have uploaded their documents yet: another email will follow once the file is complete.',
  },
  complement_fourni: {
    sujet: (reference) => `File ${reference}: replacement to review`,
    texte:
      'The guarantor has submitted a replacement. Review it in your space before validating it or asking for another correction.',
  },
  complet: {
    sujet: (reference) => `File ${reference} complete`,
    texte:
      'The guarantor has uploaded their documents and their ratio is above your threshold. The file is ready to be taken.',
  },
  garant_insuffisant: {
    sujet: (reference) => `File ${reference}: insufficient guarantor`,
    texte:
      'The guarantor has uploaded their documents, but their ratio is below your threshold. The tenant has been informed. Another guarantor requires a new file.',
  },
}

export const cloture: { [P in keyof typeof Fr.cloture]: { sujet: string; texte: string } } = {
  locataire: {
    sujet: 'Your file has been closed',
    texte:
      'The agency closed this file before its end date. Your link no longer works and your guarantor’s documents have been erased. For another property, open a new file.',
  },
  garant: {
    sujet: 'The file has been closed',
    texte:
      'The agency closed the file you were guaranteeing, before its end date. Your link no longer works and your documents have been erased: the key that protected them has been destroyed. You have nothing to do.',
  },
}

export const pied = 'Cloison'
