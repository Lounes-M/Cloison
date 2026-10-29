/** Textes des logements de l'agence (migration 0069). Vouvoiement. */
export const logements = {
  titre: 'Logements',
  etiquette: 'Comparer les candidats',
  lien: 'Logements',
  retour: '← Retour aux dossiers',
  retourListe: '← Tous les logements',
  aide: 'Regroupez les dossiers par bien pour comparer les candidats d’un même logement. Un logement ne contient aucune donnée de candidat et reste après la purge des dossiers.',
  aucun: 'Aucun logement pour l’instant. Créez-en un pour y rattacher des dossiers.',
  nouveau: {
    titre: 'Nouveau logement',
    libelle: 'Libellé du bien',
    libelleAide: 'Par exemple « T2 Croix-Rousse, 3e étage ». Évitez le nom du propriétaire.',
    loyer: 'Loyer mensuel, charges comprises (facultatif)',
    bouton: 'Créer le logement',
    envoi: 'Création…',
    succes: 'Logement créé.',
  },
  colonnes: {
    libelle: 'Logement',
    loyer: 'Loyer',
    candidats: 'Candidats',
    complets: 'Complets',
    pris: 'Pris',
  },
  sansLoyer: 'Non renseigné',
  archive: 'Archivé',
  lienOuvert: 'Lien de candidature ouvert',
  archiver: 'Archiver',
  desarchiver: 'Réactiver',
  voirArchives: 'Afficher les logements archivés',
  masquerArchives: 'Masquer les logements archivés',
  candidats: {
    titre: 'Candidats',
    aucun: 'Aucun dossier rattaché à ce logement pour l’instant.',
    reference: 'Référence',
    statut: 'Statut',
    ratio: 'Ratio',
    attente: 'En attente',
    ouvrir: 'Ouvrir un dossier pour ce logement',
    ouvrirAide:
      'Le dossier sera rattaché à ce logement et prendra son loyer, sauf si vous en saisissez un autre.',
  },
  rattachement: {
    titre: 'Logement',
    champ: 'Rattacher ce dossier à un logement',
    aucun: 'Aucun logement',
    bouton: 'Enregistrer',
    envoi: 'Enregistrement…',
    succes: 'Rattachement enregistré.',
    lien: 'Voir les candidats de ce logement',
  },
  attribution: {
    titre: 'Attribuer le logement',
    aide: 'Choisissez le candidat retenu parmi les dossiers pris. Le logement sera archivé, et les autres candidats dont le dossier est complet ou pris recevront le refus habituel, sans motif. Les dossiers encore incomplets restent ouverts : vous pourrez les clore.',
    attente: 'Prenez d’abord le dossier du candidat retenu pour pouvoir lui attribuer ce logement.',
    champ: 'Candidat retenu',
    confirmation:
      'Je confirme : les autres candidats seront prévenus que leur dossier n’est pas retenu.',
    bouton: 'Attribuer et prévenir les autres',
    envoi: 'Attribution…',
    succes: (refuses: number) =>
      refuses === 0
        ? 'Logement attribué et archivé. Aucun autre candidat à prévenir.'
        : refuses === 1
          ? 'Logement attribué et archivé. Un autre candidat a été prévenu.'
          : `Logement attribué et archivé. ${refuses} autres candidats ont été prévenus.`,
    erreurs: {
      candidat: 'Ce candidat n’est pas pris pour ce logement, ou ne l’est plus.',
      confirmation: 'Cochez la confirmation : les autres candidats vont être prévenus.',
      refus:
        'Le logement est archivé, mais certains candidats n’ont pas pu être refusés. Réessayez depuis leur dossier.',
    },
  },
  erreurs: {
    libelle: 'Le libellé doit faire entre 1 et 120 caractères.',
    loyer: 'Le loyer ne se lit pas. Exemple : 850 ou 850,50.',
    general: 'L’opération n’a pas abouti. Réessayez dans un instant.',
    session: 'Session expirée.',
  },
} as const
