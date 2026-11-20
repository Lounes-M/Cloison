import type { Textes } from '@/lib/i18n'
import type { examen as Fr } from '../examen'

export const examen: Textes<typeof Fr> = {
  titre: 'Human review of the document',
  aide: 'A file being present, or transcribed by AI, is not a human review. This assessment does not certify that the document is authentic and does not change the status of the file automatically.',
  etats: {
    a_examiner: 'To review',
    examine: 'Reviewed: legible and complete',
    a_revoir: 'To check again',
  },
  choix: 'Your assessment',
  confirmation: 'I confirm my assessment of this document after reviewing it.',
  enregistrer: 'Save the review',
  attente: 'Saving…',
  succes: 'Review saved.',
  erreur:
    'Review not saved. Reload the file: someone else may have changed it, the document may have been replaced, or the limit of 20 changes a day may have been reached.',
  ancien: 'Former team member',
  par: ' by ',
  obsolete: 'A replacement has been requested for this document. Review the new one.',
  correction: 'If a replacement is needed, use the request for a correction.',
}
