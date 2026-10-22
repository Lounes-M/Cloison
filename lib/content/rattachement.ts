/**
 * Les ecrans de la premiere connexion d'agence, avant tout dossier.
 *
 * La base refuse avec des messages courts et sans accents, ecrits dans des
 * migrations qu'on ne modifie plus. Ils ne sont jamais affiches tels quels :
 * `refus.messages` les traduit, et tout message inconnu tombe sur le texte
 * par defaut plutot que de montrer un libelle technique.
 */
export const rattachement = {
  nomRequis: {
    titre: 'Encore une chose',
    texte:
      'Votre adresse est vérifiée. Il ne manque que le nom sous lequel votre agence apparaîtra.',
    domaineParDefaut: 'votre domaine',
    libelle: 'Le nom de votre agence',
    aide: 'Vous êtes la première personne de ce domaine à arriver : vous nommez l’espace et vous l’administrez. Vos collègues du même domaine pourront ensuite demander à le rejoindre, et vous accepterez chaque demande.',
    premier: (domaine: string) => `Première connexion pour ${domaine}.`,
    envoi: 'Création…',
    bouton: 'Créer mon espace',
    requis: 'Le nom de votre agence est requis.',
    long: 'Ce nom est trop long.',
  },
  refus: {
    titre: 'Pas cette adresse',
    aide: 'Le rattachement se fait par le domaine de votre adresse : c’est lui qui vous relie à vos collègues, et une adresse personnelle ne relie à personne.',
    messages: {
      'Authentification requise.':
        'Votre session a expiré. Reconnectez-vous avec le lien reçu par e-mail.',
      'Adresse e-mail non confirmee.':
        'Votre adresse e-mail n’est pas encore confirmée. Ouvrez le lien reçu par e-mail.',
      'Une adresse professionnelle est requise.':
        'Une adresse professionnelle est requise : une adresse personnelle ne relie à aucune agence.',
      'Rattachement refuse.':
        'L’accès à cette agence vous a été retiré, ou l’agence est suspendue. Contactez un de ses administrateurs.',
    } as Record<string, string>,
    parDefaut: 'Cette adresse ne permet pas de rejoindre une agence.',
  },
  panne: {
    titre: 'Ça n’a pas marché',
    texte: 'Réessayez dans un instant. Si le problème persiste, écrivez-nous.',
  },
} as const
