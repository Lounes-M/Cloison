export const pilotage = {
  titre: 'Vos priorités',
  aide: 'Ces indicateurs couvrent les dossiers accessibles de votre agence, indépendamment des filtres ci-dessous.',
  indisponible: 'Indisponible',
  panne: 'Certains indicateurs n’ont pas pu être chargés. Actualisez la page pour réessayer.',
  indicateurs: [
    { cle: 'complet', titre: 'À examiner', href: '/espace?statut=complet' },
    { cle: 'garant_insuffisant', titre: 'À revoir', href: '/espace?statut=garant_insuffisant' },
    { cle: 'transmis', titre: 'Transmis', href: '/espace?statut=transmis' },
    {
      cle: 'echeance',
      titre: 'Coffres à échéance sous 7 jours',
      href: '/espace?horizon=7&tri=echeance',
    },
  ],
  lotTitre: 'Attribuer plusieurs dossiers',
  lotAide:
    'Sélectionnez jusqu’à 20 dossiers de cette page. Chaque affectation est indépendante : un refus conserve les autres résultats. Le responsable organise le suivi, sans changer les droits de consultation.',
  choix: 'Responsable pour cette sélection',
  moi: 'Moi',
  liberer: 'Sans responsable',
  confirmation: 'Je confirme l’affectation des dossiers sélectionnés.',
  envoyer: 'Appliquer à la sélection',
  attente: 'Traitement de la sélection…',
  selection: (n: number) =>
    `${n} dossier${n > 1 ? 's' : ''} sélectionné${n > 1 ? 's' : ''} sur 20 maximum`,
  aucun: 'Aucun dossier modifiable sur cette page.',
  equipeIndisponible:
    'La liste des collaborateurs est indisponible. Actualisez avant de préparer une attribution groupée.',
  erreur:
    'La sélection n’a pas pu être traitée. Vérifiez votre accès et choisissez de nouveau les dossiers.',
  bilan: 'Résultat de la sélection',
  etats: {
    confirme: 'Affectation confirmée',
    refuse: 'Refusé : actualisez le dossier',
    incertain: 'Résultat incertain : vérifiez le responsable avant de réessayer',
    non_traite: 'Non traité',
  },
  precaution:
    'En cas de résultat incertain, le serveur peut avoir enregistré la modification. Rechargez la liste avant toute nouvelle tentative.',
} as const
