import type { Textes } from '@/lib/i18n'
import type { pilotage as Fr } from '../pilotage'

export const pilotage: Textes<typeof Fr> = {
  titre: 'Your priorities',
  aide: 'These indicators cover the files your agency can access, whatever the filters below.',
  indisponible: 'Unavailable',
  panne: 'Some indicators could not be loaded. Refresh the page to try again.',
  indicateurs: [
    { cle: 'complet', titre: 'To review', href: '/espace?statut=complet' },
    {
      cle: 'garant_insuffisant',
      titre: 'To reconsider',
      href: '/espace?statut=garant_insuffisant',
    },
    { cle: 'transmis', titre: 'Accepted', href: '/espace?statut=transmis' },
    {
      cle: 'remplacement',
      titre: 'New files to review',
      href: '/espace?remplacement=1',
    },
    {
      cle: 'sans_nouvelles',
      titre: 'No news for 7 days',
      href: '/espace?sans_nouvelles=1',
    },
    {
      cle: 'sans_garant',
      titre: 'No guarantor named',
      href: '/espace?sans_garant=1',
    },
    {
      cle: 'relances_epuisees',
      titre: 'Automatic reminders used up',
      href: '/espace?relances_epuisees=1',
    },
    {
      cle: 'echeance',
      titre: 'Vaults ending within 7 days',
      href: '/espace?horizon=7&tri=echeance',
    },
  ],
  lotTitre: 'Assign several files',
  lotAide:
    'Select up to 20 files on this page. Each assignment is independent: one refusal keeps the other results. The person responsible organises the follow-up, without changing viewing rights.',
  choix: 'Person responsible for this selection',
  moi: 'Me',
  liberer: 'Unassigned',
  confirmation: 'I confirm the assignment of the selected files.',
  envoyer: 'Apply to the selection',
  attente: 'Processing the selection…',
  selection: (n) => `${n} file${n > 1 ? 's' : ''} selected out of 20 at most`,
  aucun: 'No file can be changed on this page.',
  selectionModifiee:
    'The list has changed and some selected files are no longer visible. Refresh the page before preparing a new selection.',
  equipeIndisponible:
    'The list of team members is unavailable. Refresh before preparing a bulk assignment.',
  erreur: 'The selection could not be processed. Check your access and choose the files again.',
  bilan: 'Result of the selection',
  etats: {
    confirme: 'Assignment confirmed',
    refuse: 'Refused: refresh the file',
    incertain: 'Uncertain result: check the person responsible before trying again',
    non_traite: 'Not processed',
  },
  actualiser: 'Reload the list',
  precaution:
    'If a result is uncertain, the server may have saved the change. Reload the list before any new attempt.',
}
