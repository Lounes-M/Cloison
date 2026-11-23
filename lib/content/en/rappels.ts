import type { Textes } from '@/lib/i18n'
import type * as Fr from '../rappels'

export const rappels: Textes<typeof Fr.rappels> = {
  titre: 'Reminders and deadlines',
  etiquette: 'Agency settings',
  retour: 'Back to files',
  aide: 'Support pending uploads and anticipate the deletion of supporting documents at their deadline.',
  relance: 'Remind the tenant and the guarantor after a period with no change',
  echeance: 'Warn team members before the file reaches its deadline',
  desactive: 'Off',
  jours: (n) => `${n} days`,
  limites:
    'Guarantor reminders concern incomplete uploads and corrections still expected. Tenant reminders concern a file still to be paid, a guarantor still to be named or a rent still to be declared. Three reminders at most per person and per step, at least three days apart. New activity postpones the reminder. No new link is created and no deadline is extended.',
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
      'Your upload, or a correction requested by your agency, is still pending. Come back to your space with your usual link to see the next step. If your link has expired, ask the tenant to send you a new one from their space. No supporting document should be sent by email.',
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

export const courrielsRelanceLocataire: Textes<typeof Fr.courrielsRelanceLocataire> = {
  paiement: {
    sujet: 'Your Cloison file is waiting for its payment',
    texte:
      'Your file is open but not yet paid for: your guarantor’s link cannot be sent. Come back to your space with your usual link to pay for the file, then name your guarantor.',
  },
  garant: {
    sujet: 'Your Cloison file is waiting for your guarantor',
    texte:
      'You have not named your guarantor yet. Come back to your space with your usual link and enter their email address: they will receive a link to upload their documents on their side.',
  },
  loyer: {
    sujet: 'Your Cloison file is waiting for your rent',
    texte:
      'The rent of your file has not been declared yet. Without it, the file stays on hold. Come back to your space with your usual link to enter it.',
  },
  lienExpire:
    'If your link has expired, request a new one from “Find my file”, with the reference below. This message does not extend the retention of the file.',
  bouton: 'Find my file',
  reference: 'File reference',
  expiration: 'Retention deadline',
}

export const courrielsFinDossier: Textes<typeof Fr.courrielsFinDossier> = {
  locataire: {
    sujet: 'Your Cloison file is nearing its deadline',
    texte:
      'Your file is nearing the end of its retention period. On the date below it will be closed and your guarantor’s supporting documents will be deleted. If a decision is still pending, tell your agency before that date. After it, you will need to open a new file. This message does not extend the retention period.',
  },
  garant: {
    sujet: 'Your Cloison file is nearing its deadline',
    texte:
      'The file you are guaranteeing is nearing the end of its retention period. On the date below it will be closed and your supporting documents will be permanently deleted. You have nothing to do. If an upload or a signature is still expected from you, complete it before that date with your usual link. This message does not extend the retention period.',
  },
  reference: 'File reference',
  expiration: 'Retention deadline',
}
