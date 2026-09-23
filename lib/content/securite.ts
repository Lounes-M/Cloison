export const securite = {
  titre: 'Sécurisez votre accès',
  aide: 'Ajoutez ce compte à votre application d’authentification, puis saisissez son code à six chiffres.',
  aideConnexion: 'Saisissez le code à six chiffres de votre application d’authentification.',
  choisirFacteur: 'Application d’authentification',
  aideFacteur: 'Vous pouvez choisir une autre application déjà vérifiée sur votre compte.',
  nomFacteur: (numero: number, nom?: string) =>
    `Application ${numero}${nom?.trim() ? ` : ${nom.trim().slice(0, 80)}` : ''}`,
  indisponible: 'La liste de vos applications est indisponible. Réessayez dans un instant.',
  reessayer: 'Réessayer',
  activer: 'Configurer l’authentification à deux facteurs',
  verifier: 'Vérifier le code',
  code: 'Code à six chiffres',
  scanner: 'Scannez ce QR code avec votre application',
  qr: 'QR code de configuration de votre application d’authentification',
  manuel: 'Saisir la clé manuellement',
  aideManuelle:
    'Si le scan est impossible, saisissez cette clé dans votre application. Ne la partagez pas.',
  aideCode: 'Utilisez le code actuellement affiché dans votre application.',
  erreur: 'Vérification impossible. Vérifiez votre code et réessayez.',
  deconnexion: 'Se déconnecter',
}
