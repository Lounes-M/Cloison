import type { Textes } from '@/lib/i18n'
import type { applicationSecours as Fr } from '../application-secours'

export const applicationSecours: Textes<typeof Fr> = {
  inventaire: 'Your verified apps',
  verifiee: 'Verified',
  tester: 'Test this app',
  testReussi: 'The code from this app has been confirmed.',
  aideTest:
    'Test a code from your backup device before relying on it. The check may sign out your other sessions.',
  perte:
    'If you have lost all your devices, contact support through the usual channel. An email address alone is not enough to restore access. Verified apps cannot be removed for now.',
  incertain: 'The result cannot be confirmed. Refresh the page before starting again.',
  titre: 'Backup app',
  aide: 'Add a second app on another device so you can sign in if your usual device is lost.',
  precaution:
    'Keep this device separately. Confirming signs out your other sessions. Do not share the QR code or the setup key.',
  ajouter: 'Set up my backup app',
  recommencer: 'Cancel this setup and start again',
  attente:
    'A setup is pending. If you have already scanned the QR code, enter its code. Otherwise, start again to get a new key.',
  disponible: 'At least two apps are verified. You can choose your app when you sign in.',
  succes: 'Your backup app is verified.',
  erreur:
    'Operation not possible. Refresh the page and try again. Your verified apps remain available.',
  codeInvalide: 'Code not confirmed. Enter a new code from this app or start the setup again.',
  retour: 'Back to files',
  etiquette: 'Account protection',
}
