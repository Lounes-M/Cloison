/** Textes de la page d'activite de l'agence (migration 0068). Vouvoiement. */
export const activite = {
  titre: 'Activité de l’agence',
  etiquette: 'Douze derniers mois',
  retour: '← Retour aux dossiers',
  lien: 'Activité de l’agence',
  aide: 'Des compteurs mois par mois, conservés après la purge des dossiers. Ils ne désignent aucun candidat ni aucun garant : ni référence, ni adresse, ni montant.',
  totaux: {
    ouverts: 'Dossiers reçus',
    acceptation: 'Taux d’acceptation',
    delai: 'Délai moyen jusqu’à la prise',
  },
  aucun: 'Pas encore de décision',
  jours: (valeur: string) => `${valeur} j`,
  pourcent: (valeur: string) => `${valeur} %`,
  colonnes: {
    mois: 'Mois',
    ouverts: 'Reçus',
    pris: 'Pris',
    refuses: 'Refusés',
    signes: 'Signés',
    clos: 'Clos',
    delai: 'Délai moyen',
  },
  legende:
    'Le taux d’acceptation rapporte les dossiers pris aux décisions rendues (pris et refusés). Les dossiers de démonstration et ceux d’un second garant ne sont pas comptés.',
} as const
