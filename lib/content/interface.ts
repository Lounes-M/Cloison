export const interfaceEspace = {
  agence: 'Espace agence',
  porteur: 'Chacun son espace',
  accueil: 'Retour à l’accueil',
  navigation: 'Navigation de votre espace',
  tableau: 'Mes dossiers',
  principal: 'Aller au contenu',
  signature: 'Un dossier commun. Des espaces séparés.',
  ouverture: 'On commence ici',
  connexion: 'Bienvenue chez vous',
  connexionTitre: 'Votre espace agence',
  connexionTexte:
    'Pas de mot de passe. Recevez un lien de connexion à votre adresse professionnelle pour retrouver vos dossiers.',
  securite: 'Une protection de plus',
  equipe: 'Votre équipe, au même endroit',
  connecteurs: 'Vos outils, reliés au suivi',
  parcours: 'Trois rôles. Une règle : chacun sa place.',
  roles: [
    { nom: 'Locataire', texte: 'Tu ouvres le dossier et tu suis son avancée.', ton: 'mint' },
    { nom: 'Garant', texte: 'Tu déposes tes pièces dans ton espace privé.', ton: 'sun' },
    { nom: 'Agence', texte: 'Vous examinez le dossier dans votre espace.', ton: 'sky' },
  ],
} as const
