import type { Textes } from '@/lib/i18n'
import type { preferences as Fr } from '../preferences'

export const preferences: Textes<typeof Fr> = {
  titre: 'My notifications',
  etiquette: 'Personal preferences',
  retour: 'Back to files',
  aide: 'Choose the follow-up emails you want to receive for your agency.',
  choix: 'Follow-up notifications',
  modes: {
    tous: 'All the files of my agency',
    mes: 'Only the files I am responsible for',
    aucun: 'No follow-up email',
  },
  limites:
    'This setting covers complete files, insufficient guarantors and replacements to review. Sign-in, security and payment messages stay active. Notifications already prepared may still arrive.',
  mes: 'The “only my files” choice uses the person responsible when the email is prepared. It does not resend earlier notifications after a reassignment.',
  confirmation: 'I confirm my notification preferences.',
  enregistrer: 'Save my preferences',
  attente: 'Saving…',
  succes: 'Preferences saved.',
  erreur: 'Preferences not saved. Reload the page before trying again.',
}
