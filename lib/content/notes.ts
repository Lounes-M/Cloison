/** Notes internes d'un dossier (migration 0081). Vouvoiement. */
export const notesDossier = {
  titre: 'Notes internes',
  aide: 'Visibles par les collaborateurs de l’agence seulement, jamais par le locataire ni le garant. Elles disparaissent avec le dossier.',
  champ: 'Nouvelle note',
  indication: 'Par exemple : garant joint par téléphone, pièces promises pour lundi.',
  bouton: 'Ajouter la note',
  envoi: 'Ajout en cours…',
  vide: 'Aucune note pour ce dossier.',
  indisponible: 'Les notes sont momentanément indisponibles.',
  ancien: 'Ancien collaborateur',
  supprimer: 'Supprimer',
  suppression: 'Suppression…',
  supprimerNote: (date: string) => `Supprimer la note du ${date}`,
  erreurAjout: 'La note n’a pas pu être ajoutée. Elle doit compter de 1 à 1 000 caractères.',
  erreurSuppression: 'La note n’a pas pu être supprimée.',
  limite: 1000,
} as const
