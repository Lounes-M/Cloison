export const codesSecours = {
  titre: 'Codes de récupération',
  aide: 'Préparez ces codes avant de perdre vos appareils. Chaque code permet une seule connexion après votre lien de connexion habituel. Conservez-les dans un coffre distinct de votre téléphone.',
  generer: 'Créer mes codes de récupération',
  regenerer: 'Remplacer mes codes de récupération',
  confirmer: 'Je confirme le remplacement : tous mes anciens codes deviendront inutilisables.',
  conserver:
    'Ces codes ne seront plus affichés après fermeture ou actualisation. Conservez-les maintenant, puis masquez-les. Ne les envoyez pas par e-mail et ne les partagez pas avec le support.',
  masquer: 'J’ai conservé mes codes, les masquer',
  masques: 'Codes masqués. Actualisez cette page pour consulter le nombre de codes disponibles.',
  codes: 'Vos codes à usage unique',
  attente: 'Vérification en cours…',
  erreur:
    'Opération non confirmée. Actualisez avant de recommencer. Aucun code saisi ne doit être transmis au support.',
  indisponible: 'Les codes de récupération ne sont pas disponibles sur cet environnement.',
  restant: (n: number) => `${n} code${n > 1 ? 's' : ''} encore disponible${n > 1 ? 's' : ''}.`,
  aucun: 'Aucun jeu de codes n’est préparé.',
  connexion: 'Utiliser un code de récupération',
  code: 'Code de récupération à usage unique',
  verifier: 'Vérifier mon code de récupération',
  invalide:
    'Code non confirmé ou déjà utilisé. Réessayez avec un code disponible, ou utilisez votre application.',
  limite: 'Trop de tentatives. Patientez avant de réessayer, ou utilisez votre application.',
  remplacement:
    'La récupération ne remplace pas votre application. Après connexion, configurez et testez un appareil de secours.',
  telecharger: 'Télécharger mes codes',
  fichier: 'cloison-codes-recuperation.txt',
  contenu:
    'Cloison : codes de récupération à usage unique. À conserver dans votre coffre privé. Ne pas communiquer au support.',
}
