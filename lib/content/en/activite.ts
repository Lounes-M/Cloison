import type { Textes } from '@/lib/i18n'
import type { activite as Fr } from '../activite'

export const activite: Textes<typeof Fr> = {
  titre: 'Agency activity',
  etiquette: 'Last twelve months',
  retour: '← Back to files',
  lien: 'Agency activity',
  aide: 'Month-by-month counters, kept after files are purged. They identify no applicant and no guarantor: no reference, no address, no amount.',
  totaux: {
    ouverts: 'Files received',
    acceptation: 'Acceptance rate',
    delai: 'Average time to acceptance',
  },
  aucun: 'No decision yet',
  jours: (valeur) => `${valeur} d`,
  pourcent: (valeur) => `${valeur}%`,
  colonnes: {
    mois: 'Month',
    ouverts: 'Received',
    pris: 'Accepted',
    refuses: 'Declined',
    signes: 'Signed',
    clos: 'Closed',
    delai: 'Average time',
  },
  exporter: 'Download these counters as CSV',
  colonnesCSV: [
    'Month',
    'Received',
    'Accepted',
    'Declined',
    'Signed',
    'Closed',
    'Average time to acceptance (days)',
  ],
  legende:
    'The acceptance rate compares accepted files with decisions made (accepted and declined). Demo files and those of a second guarantor are not counted.',
}
