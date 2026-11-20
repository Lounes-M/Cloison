import type { Textes } from '@/lib/i18n'
import type { erreurs as Fr } from '../erreurs'

export const erreurs: Textes<typeof Fr> = {
  titreIntrouvable: 'This page cannot be found.',
  introuvable: 'This page cannot be found. Check its address or go back to the home page.',
  adresse: 'The link may be incomplete, or the page may have moved.',
  titreChargement: 'Loading was interrupted.',
  chargement: 'Try again in a moment to resume browsing.',
  titreIndisponibilite: 'The site is temporarily unavailable.',
  indisponibilite: 'Loading failed. Try again in a moment.',
  reprise: 'Resume browsing',
  accueil: 'Back to home',
  reessayer: 'Try again',
  recharger: 'Reload',
  dossier: 'Find my file',
  agence: 'Agency sign-in',
  reference: 'Reference to send us',
}
