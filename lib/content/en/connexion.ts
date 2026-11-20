import type { Textes } from '@/lib/i18n'
import type { connexion as Fr } from '../connexion'

export const connexion: Textes<typeof Fr> = {
  succes: 'Check your inbox.',
  envoye:
    'If this address can open a space, a link has just been sent. It is valid for one hour, and only once.',
  expire: 'This link has expired or has already been used. Request a new one.',
  email: 'Your work address',
  exemple: 'firstname@your-agency.com',
  aide: 'It links your account to your agency. A personal Gmail or Outlook address cannot open a space.',
  envoi: 'Sending…',
  recevoir: 'Send me my link',
}
