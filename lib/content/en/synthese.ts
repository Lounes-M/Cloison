import type { Textes } from '@/lib/i18n'
import type { synthese as Fr } from '../synthese'

export const synthese: Textes<typeof Fr> = {
  ecran: {
    titre: 'Summary for the landlord',
    aide: 'One page to hand to the owner: the ratio against your threshold, the documents reviewed and the status of the deed. It contains no supporting document and no income amount. Each copy bears your name and its download is recorded in the file’s log.',
    telecharger: 'Download the summary (PDF)',
  },
  refus:
    'The summary could not be prepared. The file is no longer accessible, or the limit of ten summaries per hour has been reached.',
  indisponible: 'The summary could not be produced. Try again in a moment.',
  fichier: 'landlord-summary',
  pdf: {
    titre: 'Guarantee file summary',
    sousTitre: (agence, date) => `Prepared by ${agence} on ${date}, for the landlord.`,
    demonstration: 'Demonstration file: fictitious guarantor, of no value for a real lease.',
    dossier: 'The file',
    reference: 'Reference',
    locataire: 'Tenant',
    logement: 'Property',
    loyer: 'Monthly rent',
    garant: 'Guarantor',
    decision: 'Agency’s decision',
    nonRenseigne: 'Not provided',
    statuts: {
      complet: 'File complete, decision pending',
      garant_insuffisant: 'File complete, solvency below the threshold',
      transmis: 'File accepted by the agency',
      signe: 'File accepted, deed signed',
    },
    solvabilite: 'Guarantor’s solvency',
    ratio: (valeur) => `${valeur} times the rent`,
    ratioAttente: 'Ratio not calculated yet',
    seuil: (valeur) => `Threshold set by the agency: ${valeur} times the rent.`,
    atteint: 'Threshold met',
    nonAtteint: 'Threshold not met',
    calcule: (date) => `Calculated on ${date}.`,
    groupe: (valeur, reference) =>
      `Two guarantors commit for this property. Solvency of both guarantors together: ${valeur} times the rent (linked file ${reference}).`,
    groupeAttente: (reference) =>
      `Two guarantors commit for this property (linked file ${reference}). Their joint solvency has not been calculated yet.`,
    ratioNote:
      'The ratio compares the net monthly income declared by the guarantor with the rent. The amount of that income is not disclosed.',
    engagement: 'Guarantor’s commitment',
    engagementAucun: 'The guarantor has not specified their commitment yet.',
    nature: 'Type',
    solidaire: 'Joint and several guarantee',
    simple: 'Simple guarantee',
    couvre: 'Coverage',
    couvertures: { loyer: 'Rent only', loyer_charges: 'Rent and charges' },
    plafond: 'Cap of the commitment',
    sansPlafond: 'Not specified',
    duree: 'Duration',
    jusquAu: (date) => `Until ${date}`,
    dureeDuBail: 'Duration of the lease',
    mention: 'Personal statement',
    mentionEcrite: (date) => `Entered by the guarantor on ${date}`,
    mentionAbsente: 'Not entered yet',
    pieces: 'Documents reviewed by the agency',
    piecesAucune: 'No document in the file.',
    documents: (n) => (n > 1 ? `${n} documents` : '1 document'),
    examens: {
      examine: 'Reviewed',
      a_revoir: 'To check again',
      a_examiner: 'Not reviewed',
    },
    examineLe: (date) => `Reviewed on ${date}`,
    bilan: (examinees, total) =>
      `${examinees} of ${total} document type${total > 1 ? 's' : ''} reviewed by a member of the agency.`,
    piecesNote:
      'The review covers whether the documents are legible and complete. It does not certify that they are authentic.',
    acte: 'Guarantee deed',
    actes: {
      aucun: 'Not prepared in Cloison yet.',
      preparation: 'Being prepared.',
      en_cours: 'Electronic signature in progress.',
      archive: 'Signed electronically. The deed and its proof are archived.',
      incertain: 'Signature being verified.',
      signe: 'Signed.',
    },
    pied: 'This document contains no supporting document. The guarantor’s documents remain encrypted in Cloison’s vault and are only viewed by the agency. Named copy: its download is recorded in the file’s log.',
  },
}
