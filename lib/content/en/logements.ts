import type { Textes } from '@/lib/i18n'
import type { logements as Fr } from '../logements'

export const logements: Textes<typeof Fr> = {
  titre: 'Properties',
  etiquette: 'Compare applicants',
  lien: 'Properties',
  retour: '← Back to files',
  retourListe: '← All properties',
  aide: 'Group files by property to compare the applicants for the same home. A property holds no applicant data and remains after files are purged.',
  aucun: 'No property yet. Create one to attach files to it.',
  nouveau: {
    titre: 'New property',
    libelle: 'Name of the property',
    libelleAide: 'For example “One-bed Croix-Rousse, 3rd floor”. Avoid the owner’s name.',
    loyer: 'Monthly rent, charges included (optional)',
    bouton: 'Create the property',
    envoi: 'Creating…',
    succes: 'Property created.',
  },
  colonnes: {
    libelle: 'Property',
    loyer: 'Rent',
    candidats: 'Applicants',
    complets: 'Complete',
    pris: 'Accepted',
  },
  sansLoyer: 'Not provided',
  archive: 'Archived',
  lienOuvert: 'Application link open',
  archiver: 'Archive',
  desarchiver: 'Reactivate',
  voirArchives: 'Show archived properties',
  masquerArchives: 'Hide archived properties',
  candidats: {
    titre: 'Applicants',
    aucun: 'No file attached to this property yet.',
    reference: 'Reference',
    statut: 'Status',
    ratio: 'Ratio',
    attente: 'Pending',
    ouvrir: 'Open a file for this property',
    ouvrirAide:
      'The file will be attached to this property and will take its rent, unless you enter another one.',
  },
  rattachement: {
    titre: 'Property',
    champ: 'Attach this file to a property',
    aucun: 'No property',
    bouton: 'Save',
    envoi: 'Saving…',
    succes: 'Attachment saved.',
    lien: 'See the applicants for this property',
  },
  attribution: {
    titre: 'Award the property',
    aide: 'Choose the successful applicant among the accepted files. The property will be archived, and the other applicants whose file is complete or accepted will receive the usual refusal, with no reason given. Files that are still incomplete stay open: you can close them.',
    attente: 'Accept the successful applicant’s file first to be able to award them this property.',
    champ: 'Successful applicant',
    confirmation:
      'I confirm: the other applicants will be told that their file has not been selected.',
    bouton: 'Award and notify the others',
    envoi: 'Awarding…',
    succes: (refuses) =>
      refuses === 0
        ? 'Property awarded and archived. No other applicant to notify.'
        : refuses === 1
          ? 'Property awarded and archived. One other applicant has been notified.'
          : `Property awarded and archived. ${refuses} other applicants have been notified.`,
    erreurs: {
      candidat: 'This applicant is not accepted for this property, or no longer is.',
      confirmation: 'Tick the confirmation: the other applicants are going to be notified.',
      refus:
        'The property is archived, but some applicants could not be declined. Try again from their file.',
    },
  },
  erreurs: {
    libelle: 'The name must be 1 to 120 characters long.',
    loyer: 'The rent cannot be read. Example: 850 or 850.50.',
    general: 'This did not go through. Try again in a moment.',
    session: 'Session expired.',
  },
}
