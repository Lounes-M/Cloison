import type { Textes } from '@/lib/i18n'
import type { calendrier as Fr } from '../calendrier'

export const calendrier: Textes<typeof Fr> = {
  titre: 'Deadline in your calendar',
  aide: 'Download a calendar file with the file reference and the end date of the vault, then import it into your calendar. This copy does not update itself: check the date in Cloison before you act.',
  telecharger: 'Download the deadline (.ics)',
  attente: 'Preparing the calendar file…',
  succes:
    'File ready. You can import it into your calendar. It creates no invitation and contains no document.',
  erreur:
    'The calendar is unavailable. Reload the file to check your access and its deadline, then try again.',
  evenement: 'Cloison: end of vault',
  description:
    'End date of the document vault. This date does not describe the duration of the signed deed. One-off copy: check the current date in Cloison. No automatic update after import.',
  indisponible: 'Deadline unavailable.',
}
