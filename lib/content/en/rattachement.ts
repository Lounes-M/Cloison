import type { Textes } from '@/lib/i18n'
import type { rattachement as Fr } from '../rattachement'

/** Les cles de `refus.messages` sont les messages de la base, jamais affiches. */
export const rattachement: Textes<typeof Fr> = {
  nomRequis: {
    titre: 'One more thing',
    texte:
      'Your address is verified. All that is missing is the name your agency will appear under.',
    domaineParDefaut: 'your domain',
    libelle: 'The name of your agency',
    aide: 'You are the first person from this domain to arrive: you name the space and you administer it. Your colleagues from the same domain can then ask to join, and you will accept each request.',
    premier: (domaine) => `First sign-in for ${domaine}.`,
    envoi: 'Creating…',
    bouton: 'Create my space',
    requis: 'The name of your agency is required.',
    long: 'This name is too long.',
  },
  refus: {
    titre: 'Not this address',
    aide: 'You are linked through the domain of your address: it is what connects you to your colleagues, and a personal address connects you to no one.',
    messages: {
      'Authentification requise.':
        'Your session has expired. Sign in again with the link received by email.',
      'Adresse e-mail non confirmee.':
        'Your email address is not confirmed yet. Open the link received by email.',
      'Une adresse professionnelle est requise.':
        'A work address is required: a personal address is not linked to any agency.',
      'Rattachement refuse.':
        'Your access to this agency has been removed, or the agency is suspended. Contact one of its administrators.',
    },
    parDefaut: 'This address cannot be used to join an agency.',
  },
  panne: {
    titre: 'That did not work',
    texte: 'Try again in a moment. If the problem continues, write to us.',
  },
}
