import type { liens as Fr } from '../liens'

/** Les courriels qui portent un lien, en anglais. */
export const liens: typeof Fr = {
  validite:
    'This link can be reused for seven days at most, within the validity of the file. A new link replaces the previous one.',
  fin: (date: string) =>
    `This link can be reused until ${date} (Paris time), unless it is revoked or the file expires. A new link replaces the previous one.`,
  retrouver: 'If you lose it, ask for a new link from the Find my file page.',
  locataire: {
    sujet: (reference: string) => `Your Cloison file is open (${reference})`,
    titre: 'Your guarantee file is open.',
    lien: 'Here is your link to come back to it, name your guarantor and follow its progress:',
  },
  garant: {
    sujet: (demandePar: string, reference: string) =>
      `${demandePar} is asking you to act as their guarantor (${reference})`,
    titre: 'You have been asked to act as a guarantor.',
    designe: (demandePar: string) =>
      `${demandePar} is putting together a rental file and has named you as their guarantor.`,
    lien: 'Here is your link to upload your documents, on your side and in full privacy: the tenant will never see what you upload, only that the file is moving forward.',
  },
}
