import type { Textes } from '@/lib/i18n'
import type { informationCollecte as Fr } from '../information-collecte'

export const informationCollecte: Textes<typeof Fr> = {
  locataire:
    'Your address is used to send you your link and to follow your file, which is deleted three months after it is opened at the latest.',
  garant:
    'Your documents are encrypted, the agency only sees them watermarked with its name, and they are deleted with the file, three months after it is opened at the latest.',
  lien: 'What we do with it',
}
