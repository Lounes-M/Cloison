import type { Textes } from '@/lib/i18n'
import type { brouillons as Fr } from '../brouillons'

export const brouillons: Textes<typeof Fr> = {
  absent: 'No draft saved.',
  sauvegarder: 'Keep this entry as a draft',
  reprendre: 'Resume my draft',
  supprimer: 'Delete my draft',
  aide: 'Your draft is encrypted on the server for seven days at most, within the life of your file. It does not declare your commitment and does not contain your handwritten statement. A change to the terms or to the guarantor deletes it.',
  sauvegarde: 'Draft saved. Your declared commitment is unchanged.',
  supprime: 'The content of your draft has been deleted.',
  disponible: 'A draft is available. Resume it explicitly to fill in this form.',
  ecrasement: 'Resuming replaces the fields of this form. Your unsaved changes will be lost.',
  confirmer: 'Replace my entry with the draft',
  erreur:
    'The draft cannot be confirmed. Your entry stays in this form. Keep a copy, then refresh to check the latest state.',
  conflit:
    'The file or the draft has changed. No save was confirmed. Check the latest state before starting again.',
  expiration: 'Kept until, at the latest,',
}
