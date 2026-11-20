import type { Textes } from '@/lib/i18n'
import type { securite as Fr } from '../securite'

export const securite: Textes<typeof Fr> = {
  titre: 'Secure your access',
  aide: 'Add this account to your authenticator app, then enter its six-digit code.',
  aideConnexion: 'Enter the six-digit code from your authenticator app.',
  choisirFacteur: 'Authenticator app',
  aideFacteur: 'You can choose another app already verified on your account.',
  nomFacteur: (numero, nom) => `App ${numero}${nom?.trim() ? `: ${nom.trim().slice(0, 80)}` : ''}`,
  indisponible: 'The list of your apps is unavailable. Try again in a moment.',
  reessayer: 'Try again',
  activer: 'Set up two-factor authentication',
  verifier: 'Check the code',
  code: 'Six-digit code',
  scanner: 'Scan this QR code with your app',
  qr: 'Setup QR code for your authenticator app',
  manuel: 'Enter the key manually',
  aideManuelle: 'If you cannot scan, enter this key in your app. Do not share it.',
  aideCode: 'Use the code currently shown in your app.',
  erreur: 'Could not verify. Check your code and try again.',
  deconnexion: 'Sign out',
  guide: {
    titre: 'First setup, step by step',
    etapes: [
      'Install an authenticator app on your phone: Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden or any TOTP-compatible app.',
      'Press “Set up”, then scan the QR code with this app. It then shows a code that changes every thirty seconds.',
      'Enter this code here. You will be asked for it at every sign-in, along with the link received by email.',
    ],
    secours:
      'Then add a backup app on a second device, from the settings of your space: it saves you from waiting for a reset if you lose your phone.',
  },
  perte:
    'Lost your phone? An administrator of your agency can reset your two-factor authentication from the team page. If there is no other administrator, write to support.',
}
