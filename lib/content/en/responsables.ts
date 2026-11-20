import type { Textes } from '@/lib/i18n'
import type { responsables as Fr } from '../responsables'

export const responsables: Textes<typeof Fr> = {
  titre: 'Person responsible for the file',
  aucun: 'Unassigned',
  indisponible: 'Team member unavailable',
  choix: 'Assign to',
  confirmation: 'I confirm this assignment of the file.',
  enregistrer: 'Save the assignment',
  prendre: 'Assign this file to me',
  liberer: 'Release this file',
  attente: 'Saving…',
  succes: 'Assignment saved.',
  erreur:
    'Assignment not saved. Reload the file to check its latest version and the available team members.',
  membre: 'The person currently responsible or an administrator can release this file.',
  aide: 'The person responsible organises the follow-up. This assignment does not change what the agency’s team members can view.',
  precedent: 'Previous team members',
  suivant: 'Next team members',
  navigation: 'Pages of available team members',
  filtre: 'Assignment',
  filtres: { tous: 'All files', mes: 'My files', sans: 'Unassigned' },
  statut: 'File status',
  tousStatuts: 'All statuses',
}
