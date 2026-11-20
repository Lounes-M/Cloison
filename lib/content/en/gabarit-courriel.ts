import type { Textes } from '@/lib/i18n'
import type { gabaritCourriel as Fr } from '../gabarit-courriel'

export const gabaritCourriel: Textes<typeof Fr> = {
  signature: 'One shared file. Separate spaces.',
  reference: 'File reference',
  echeance: 'End of vault',
  heure: 'Paris time',
  boutons: {
    locataire: 'Open my file',
    garant: 'Open my space',
    agence: 'Open the file',
  },
  lienBrut: 'If the button does not respond, this link leads to the same place:',
  pourquoi: 'This message is about a Cloison file linked to this address.',
  automatique:
    'Cloison never asks for a password or a document by email. Documents are only uploaded in the secure space.',
  mentions: 'Legal notice',
  confidentialite: 'Privacy',
}
