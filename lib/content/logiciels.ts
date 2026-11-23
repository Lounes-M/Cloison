/** Textes de l'import des biens depuis le logiciel de l'agence (0089). Vouvoiement. */
export const logiciels = {
  titre: 'Importer vos biens depuis Apimo',
  aide: 'Cloison lit vos biens à louer dans Apimo et crée les logements correspondants : libellé, loyer, ville, surface, pièces et disponibilité. Aucun contact, aucun propriétaire et aucun candidat ne sont lus, et rien n’est écrit dans Apimo.',
  prealable:
    'Au préalable, demandez au support d’Apimo d’activer l’accès de Cloison aux biens de votre agence.',
  identifiant: 'Identifiant de votre agence chez Apimo',
  identifiantAide:
    'Un nombre, visible dans vos paramètres Apimo. Laissez vide pour retirer la connexion.',
  enregistrer: 'Enregistrer',
  enregistrement: 'Enregistrement…',
  enregistre: 'Identifiant enregistré.',
  importer: 'Importer les biens à louer',
  importation: 'Import en cours…',
  dernier: 'Dernier import',
  jamais: 'Aucun import pour l’instant.',
  voir: 'Voir les logements',
  succes: (crees: number, misAJour: number) =>
    `Import terminé. Logements créés : ${crees}. Logements mis à jour : ${misAJour}.`,
  erreurs: {
    identifiant: 'L’identifiant est un nombre de dix chiffres au plus.',
    session: 'Session expirée, ou opération réservée à l’administrateur.',
    general: 'L’opération n’a pas abouti. Réessayez dans un instant.',
    cadence: 'Enregistrez d’abord l’identifiant, ou patientez une minute entre deux imports.',
    aucun: 'Apimo ne présente aucun bien à louer pour cette agence.',
    lecture: {
      non_configure: 'L’import depuis Apimo n’est pas ouvert.',
      refuse:
        'Apimo a refusé la lecture. Vérifiez l’identifiant et l’activation de l’accès auprès du support d’Apimo.',
      limite: 'Apimo limite les lectures pour le moment. Réessayez plus tard.',
      indisponible: 'Apimo ne répond pas. Réessayez plus tard.',
      reponse_invalide: 'La réponse d’Apimo ne se lit pas. Aucun logement n’a été modifié.',
      trop_de_biens:
        'Votre agence présente plus de 200 biens à louer. Aucun logement n’a été importé : écrivez-nous pour un import adapté.',
    },
  },
} as const
