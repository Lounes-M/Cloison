import type { Textes } from '@/lib/i18n'
import type { remiseDroits as Fr } from '../remise-droits'

export const remiseDroits: Textes<typeof Fr> = {
  titre: 'Your personal data',
  introduction:
    'This temporary link lets you retrieve the files prepared for your request. Enter the key you received separately: the files will be decrypted on your device.',
  cle: 'Recovery key',
  ouvrir: 'Open my files',
  attente: 'Checking and opening…',
  erreur:
    'The handover is unavailable. Check the link and the key, then try again. If the link has expired or been revoked, contact the person who sent it to you.',
  confirmer: 'Confirm that I have retrieved my files',
  confirme: 'Your confirmation of receipt has been recorded.',
  effacer: 'Close and erase this session',
  confidentialite:
    'The key is not sent to the server. Close this session once you have saved your files on a device you trust.',
  limite:
    'The link expires automatically. A file already saved on your device remains your responsibility.',
  telecharger: 'Download',
  disponibles: 'Available files',
}
