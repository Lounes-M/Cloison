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
  erreur: 'Vérification impossible. Vérifiez votre code et réessayez.',
  deconnexion: 'Se déconnecter',
}
