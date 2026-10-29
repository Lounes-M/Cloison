export const journal = {
  titre: 'Historique des accès',
  aide: 'Consultez l’historique des accès à votre dossier.',
  indisponible: 'L’historique est momentanément indisponible.',
  aucun: 'Aucun accès enregistré.',
  navigation: 'Navigation dans l’historique des accès',
  anciens: 'Accès plus anciens',
  recents: 'Accès les plus récents',
  acces: 'Accès',
  inconnu: 'Utilisateur',
  par: ' par ',
  actions: {
    dossier_consulte: 'Dossier consulté',
    piece_deposee: 'Pièce déposée',
    piece_retiree: 'Pièce retirée',
    piece_ouverte: 'Pièce ouverte',
    complement_demande: 'Remplacement demandé',
    complement_fourni: 'Remplacement fourni',
    complement_valide: 'Remplacement validé',
    complement_refuse: 'Nouvelle correction demandée',
    dossier_transmis: 'Dossier transmis',
  } as Record<string, string>,
  acteurs: { agence: 'l’agence', garant: 'le garant', locataire: 'le locataire' } as Record<
    string,
    string
  >,
}
