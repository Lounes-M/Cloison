import type { Textes } from '@/lib/i18n'
import type * as Fr from '../rappels'

export const rappels: Textes<typeof Fr.rappels> = {
  titre: 'Reminders and deadlines',
  etiquette: 'Agency settings',
  retour: 'Back to files',
  aide: 'Support pending uploads and anticipate the deletion of supporting documents at their deadline.',
  relance: 'Remind the guarantor after a period with no change',
  echeance: 'Warn team members before the file reaches its deadline',
  desactive: 'Off',
  jours: (n) => `${n} days`,
  limites:
    'Reminders concern incomplete uploads and corrections still expected. Three reminders at most per file, at least three days apart. New activity postpones the reminder. No new link is created and no deadline is extended.',
  preferences:
    'Deadline reminders, and the alert sent when a guarantor’s three reminders go unanswered, follow your team members’ personal preferences. They stop after signature, refusal or expiry. An email already handed to the provider cannot be recalled.',
  cadence:
    'Emails follow the maintenance runs and shared limits; they are not guaranteed at a precise time.',
  confirmation: 'I confirm the reminder settings of my agency.',
  enregistrer: 'Save the reminders',
  attente: 'Saving…',
  succes: 'Settings saved.',
  erreur: 'Settings not saved. Reload the page before trying again.',
}

export const courrielsRappels: Textes<typeof Fr.courrielsRappels> = {
  depot: {
    sujet: 'Your Cloison upload is waiting for you',
    texte:
      'Your upload, or a correction requested by your agency, is still pending. Come back to your space with your usual link to see the next step. If your link has expired, ask your agency for a new one. No supporting document should be sent by email.',
  },
  echeance: {
    sujet: 'A Cloison file is nearing its deadline',
    texte:
      'This file is nearing the end of its retention period. Open it in your space if an action is still needed. The supporting documents will be deleted at the deadline; this reminder does not extend their retention.',
  },
  epuise: {
    sujet: 'A guarantor has not responded to Cloison reminders',
    texte:
      'The guarantor of this file has received their three automatic reminders without resuming their upload. Cloison will not remind them again: contacting them directly may unblock things. The file is marked “Reminders used up” in your space.',
  },
  reference: 'File reference',
  expiration: 'Retention deadline',
}
