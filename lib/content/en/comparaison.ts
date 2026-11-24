import type { Textes } from '@/lib/i18n'
import type { comparaison as Fr } from '../comparaison'

export const comparaison: Textes<typeof Fr> = {
  titre: 'Compare the declared income with the documents',
  aide: 'An AI reads the month and the net amount paid on the guarantor’s payslips and pension statement, four files at most. Cloison then calculates the average and compares it with the declaration. This is a reviewing aid: it can be wrong and decides nothing.',
  accord:
    'Send the watermarked copies of these documents to OpenRouter and its AI provider, with no retention, to read only the month and the net amount paid.',
  lancer: 'Compare with the documents',
  attente: 'Reading, this can take a minute…',
  erreur:
    'Comparison unavailable: access, quota or processing issue. You can still open the documents.',
  etats: {
    concordant: 'Declaration consistent with the documents',
    superieur: 'Gap to check',
    inferieur: 'Declaration lower than the documents',
    illisible: 'No readable amount',
  },
  phrases: {
    concordant: 'The declared income and the amount read on the documents differ by less than 5%.',
    superieur: (montant, pourCent) =>
      `The declared income is ${montant} (${pourCent}%) higher than what was read on the documents. Another income, a bonus or a reading error may explain it: open the documents before concluding, or request a replacement.`,
    inferieur: (montant, pourCent) =>
      `The declared income is ${montant} (${pourCent}%) lower than what was read on the documents. The ratio, calculated on the declaration, does not benefit from it.`,
    illisible:
      'No net amount paid could be read on these documents. This says nothing about the file: compare them with the declaration yourself.',
  },
  declare: 'Declared income',
  lu: 'Read on the documents',
  salaire: (montant, mois) => `Average net salary paid (${mois}): ${montant}.`,
  pension: (montant, mois) => `Net pension paid (${mois}): ${montant}.`,
  partiel: (n) =>
    n > 1
      ? `Average calculated over ${n} months only, instead of three.`
      : 'Only one month of salary could be read, instead of three.',
  variable: 'The salaries read vary by more than 20% from one month to the next.',
  contradictoires: (mois) =>
    `Two different amounts were read for ${mois}: this month is not counted.`,
  illisibles: (n, total) =>
    n > 1
      ? `${n} files out of ${total} could not be read.`
      : `One file out of ${total} could not be read.`,
  modele: 'Model',
  temporaire: 'Temporary result, not saved in the file. The decision is yours.',
  effacer: 'Erase the result',
}
