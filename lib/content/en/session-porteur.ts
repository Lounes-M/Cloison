import type { Textes } from '@/lib/i18n'
import type { sessionPorteur as Fr } from '../session-porteur'

export const sessionPorteur: Textes<typeof Fr> = {
  quitter: 'Leave my file',
  autreDossier:
    'Another file has been opened in this browser. Reopen the link of the file you want to change before trying again.',
}
