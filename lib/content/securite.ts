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
  guide: {
    titre: 'Première configuration, pas à pas',
    etapes: [
      'Installez sur votre téléphone une application d’authentification : Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden ou toute application compatible TOTP.',
      'Appuyez sur « Configurer », puis scannez le QR code avec cette application. Elle affiche alors un code qui change toutes les trente secondes.',
      'Saisissez ce code ici. Il vous sera redemandé à chaque connexion, avec le lien reçu par e-mail.',
    ],
    secours:
      'Ajoutez ensuite une application de secours sur un second appareil, depuis les réglages de votre espace : elle vous évite d’attendre une réinitialisation si vous perdez votre téléphone.',
  },
  perte:
    'Téléphone perdu ? Un administrateur de votre agence peut réinitialiser votre double authentification depuis la page des collaborateurs. S’il n’y en a pas d’autre, écrivez au support.',
}
