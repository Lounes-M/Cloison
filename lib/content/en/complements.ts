import type { Textes } from '@/lib/i18n'
import type { complements as Fr } from '../complements'

export const complements: Textes<typeof Fr> = {
  titre: 'Requests for corrections',
  aideAgence:
    'A request reopens the guarantor’s upload. Review the replacement before approving it. The other details of the upload can be corrected while it is reopened.',
  aideGarant:
    'Your agency is asking for a correction. Upload a new file in the same category, then attach it to the request. Your upload stays editable until the next handover.',
  motif: 'Reason for the request',
  motifs: {
    illisible: 'Illegible document',
    incomplet: 'Incomplete document',
    incorrect: 'Incorrect document',
  },
  etats: {
    demande: 'New document expected',
    fourni: 'Replacement to review',
    valide: 'Replacement approved by the agency',
  },
  demander: 'Request a replacement',
  fournir: 'Offer this replacement',
  valider: 'Approve the replacement',
  refuser: 'Request a new correction',
  remplacement: 'New file',
  aucun: 'Upload a new file in the requested category to be able to offer it.',
  ouvrir: 'Open the replacement',
  enregistre: 'Request updated.',
  erreur: 'This did not go through. Refresh the page and check the status of the file.',
  choix: 'Choose a file',
  attente: 'Saving...',
}
