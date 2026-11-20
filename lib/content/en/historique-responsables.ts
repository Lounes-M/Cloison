import type { Textes } from '@/lib/i18n'
import type { historiqueResponsables as Fr } from '../historique-responsables'

export const historiqueResponsables: Textes<typeof Fr> = {
  titre: 'Assignment history',
  aide: 'Changes are kept until the file reaches its deadline. The history starts when this feature was switched on.',
  vide: 'No change recorded.',
  indisponible: 'The history is temporarily unavailable. You can keep reviewing the file.',
  ancien: 'Former team member or unavailable account',
  aucun: 'Unassigned',
  technique: 'Technical administration',
  de: 'From',
  vers: 'To',
  par: 'By',
  recent: 'Most recent changes',
  suite: 'Earlier changes',
  navigation: 'Assignment history pages',
}
