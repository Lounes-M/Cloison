import type { Textes } from '@/lib/i18n'
import type { acte as Fr } from '../acte'

/**
 * L’ecran de redaction de l’acte, en anglais. L’acte lui-meme reste redige en
 * francais : c’est un contrat de droit francais, sur le modele officiel.
 */
export const acte: Textes<typeof Fr> = {
  retourDossier: 'Back to the file',
  etiquette: 'Guarantee deed',
  titre: 'Guarantee deed template',
  lien: 'Guarantee deed',
  explication:
    'Cloison drafts the deed from the official Service-Public.fr template, as a simple or joint and several guarantee depending on the guarantor’s terms. The guarantor’s identity, the cap, the duration and their handwritten statement come from the file. Fill in what relates to the lease. The deed itself is drafted in French.',
  mention:
    'The statement required by article 2297 of the French Civil Code is never written by Cloison: the deed reproduces, unchanged, the one the guarantor entered themselves.',
  relecture:
    'This template must be reviewed by your legal adviser before its first real use. Check every draft before sending it.',
  conditions: 'Guarantor’s terms',
  solidaire: 'Joint and several guarantee',
  simple: 'Simple guarantee',
  plafond: 'Cap of the commitment',
  duree: 'Duration',
  indeterminee: 'Open-ended',
  jusquAu: 'Until',
  sansMention:
    'The guarantor has not entered their handwritten statement yet: the deed cannot be drafted.',
  sections: {
    caution: 'Guarantor’s civil status',
    bail: 'The lease',
    loyer: 'The rent',
    acte: 'The deed',
  },
  champs: {
    civilite: 'Title',
    madame: 'Ms',
    monsieur: 'Mr',
    naissanceLe: 'Date of birth',
    naissanceLieu: 'Place of birth (town, and country if outside France)',
    locataire: 'Tenant’s first and last name',
    bailleurNom: 'Landlord (first and last name, or company name)',
    bailleurAdresse: 'Landlord’s address',
    logement: 'Address of the rented property',
    loyer: 'Rent excluding charges, in euros',
    charges: 'Advance on charges, in euros (optional)',
    periodicite: 'Payable per',
    mois: 'month',
    trimestre: 'quarter',
    an: 'year',
    revisionLe: 'Annual review date (the day and month are used)',
    irlTrimestre: 'Reference quarter of the IRL index',
    irlAnnee: 'Reference year of the IRL index',
    coCautions: 'Other guarantors of the same lease (one per line, optional)',
    autresGarantis: 'Other flatmates guaranteed by this guarantor (one per line)',
    faitLieu: 'Signed in',
    faitLe: 'On',
  },
  rappelLoyer: 'Rent including charges declared by the tenant:',
  telecharger: 'Download the draft PDF',
  attente: 'Drafting…',
  pret: 'Draft ready. Read the whole PDF before sending it.',
  limite: 'Generation limit reached. Try again later.',
  erreur: 'Drafting is not possible right now. Try again.',
  soumettre: 'Submit this draft to the guarantor',
  signatureFermee:
    'Electronic signature is not open on this space: the draft can be downloaded, reviewed and signed outside Cloison.',
  accord:
    'I have reviewed this draft: the parties, the lease, the terms and the guarantor’s statement are correct.',
  refus: {
    saisie: 'A field is missing or badly formed. Check the dates and the amounts.',
    dossier: 'This file cannot be used to draft the deed: it must be accepted and still active.',
    mention:
      'The guarantor must first complete their identity, their address and their handwritten statement.',
    mention_absente: 'The guarantor has not entered their handwritten statement yet.',
    mention_incomplete:
      'The guarantor’s statement is incomplete for these terms. They must enter it again.',
    mention_plafond:
      'The amount in the guarantor’s statement does not match the cap of the commitment. They must enter it again.',
    colocation:
      'This file is part of a flat share: accept the other flatmates’ files first, so the deed can state how many they are.',
    garantis:
      'The guarantor of this file covers several flatmates: name each of the others, one per line, no more and no fewer.',
    dates: 'Check the dates: birth, date of the deed and end of the commitment.',
    caracteres:
      'A text contains a character the PDF cannot reproduce. Correct the entry concerned.',
  },
}
