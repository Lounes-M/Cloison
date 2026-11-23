import type { Textes } from '@/lib/i18n'
import type { continuite as Fr } from '../continuite'

export const continuite: Textes<typeof Fr> = {
  retrouver: 'Find my file',
  email: 'Your email address',
  reference: 'File reference received by email',
  envoyer: 'Send me a new link',
  resultat:
    'If these details match a file that is still active, a new link will be sent to its address.',
  agence: 'Send to my agency',
  domaine: 'Your agency’s email domain',
  aide: 'Ask your agency for its exact work domain. It must be verified on Cloison. If it gave you an application link, use that instead: your file is then free. If you attach it yourself, you pay for your file before inviting your guarantor.',
  consentement:
    'I authorise this agency to review the information and documents of the file. This link to the agency is permanent.',
  transmettre: 'Link my file',
  rattache: 'The file is linked to your agency.',
  erreur: 'This did not go through. Check the details and try again.',
  garant: {
    titre: 'You are a guarantor',
    aide: 'Enter the address at which you received the invitation and the file reference it contained. A new link will be sent to you and will replace the previous one.',
    email: 'Your email address',
    reference: 'File reference',
    envoyer: 'Send me my guarantor link',
    resultat:
      'If these details match a file that is still active, a new link will be sent to the guarantor’s address.',
  },
}
