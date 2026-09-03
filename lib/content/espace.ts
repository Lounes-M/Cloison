/**
 * Ce que l'agence lit.
 *
 * Ici, et ici seulement, les chiffres apparaissent : le ratio, le seuil, le
 * montant. L'agence est celle qui decide, et elle decide sur des nombres. Le
 * vocabulaire vouvoie : c'est un espace de travail, pas un parcours.
 */

export const tableau = {
  dossiers: 'Vos dossiers',
  aucun: 'Aucun dossier pour l’instant. Ouvrez-en un ci-dessous : le locataire reçoit son lien.',
  colonnes: {
    reference: 'Référence',
    locataire: 'Locataire',
    statut: 'Statut',
    ratio: 'Ratio',
    ouvert: 'Ouvert le',
  },
  nouveau: 'Ouvrir un dossier',
  nouveauAide:
    'Le locataire reçoit un lien pour désigner son garant. Vous n’avez rien d’autre à envoyer.',
  nouveauChamp: 'Adresse e-mail du locataire',
  nouveauBouton: 'Envoyer le lien',
  nouveauEnvoi: 'Envoi…',
  nouveauSucces: (email: string) => `Dossier ouvert. Le lien est parti à ${email}.`,
  nonVerifieeTitre: 'Espace non vérifié',
  nonVerifieeTexte:
    'Vous avez accès au produit entier sur un dossier de démonstration. L’ouverture d’un dossier pour un vrai locataire attend la vérification de votre SIREN et de votre carte professionnelle.',
  seuilTitre: 'Votre seuil',
  seuilAide:
    'Le revenu net du garant, en multiples du loyer charges comprises, à partir duquel un dossier est jugé complet. Trois est la pratique la plus répandue. Le changer rejuge vos dossiers encore ouverts.',
  seuilChamp: 'Fois le loyer',
  seuilBouton: 'Enregistrer',
  seuilEnvoi: 'Enregistrement…',
  seuilSucces: 'Seuil enregistré. Vos dossiers ouverts ont été rejugés.',
  seuilLecture: (seuil: string) =>
    `Seuil de l’agence : ${seuil} fois le loyer. Seul un administrateur le modifie.`,
} as const

export const dossier = {
  retour: 'Tous les dossiers',
  reference: 'Référence',
  locataire: 'Locataire',
  garant: 'Garant',
  garantAucun: 'pas encore désigné',
  loyer: 'Loyer, charges comprises',
  loyerAucun: 'pas encore saisi par le locataire',
  engagementTitre: 'Ce que le garant couvre',
  engagementAucun: 'Le garant n’a rien déclaré pour l’instant.',
  couvre: { loyer: 'Le loyer seul', loyer_charges: 'Le loyer et les charges' },
  montant: 'Plafond mensuel',
  sansPlafond: 'sans plafond',
  jusquAu: 'Jusqu’au',
  dureeDuBail: 'la durée du bail',
  solidaire: 'Caution solidaire',
  simple: 'Caution simple',
  revenu: 'Revenu net mensuel déclaré',
  revenuAucun: 'pas encore déclaré',
  ratioTitre: 'Solvabilité',
  ratioAttente: 'En attente du loyer et du revenu déclaré.',
  ratio: (ratio: string, seuil: string) => `${ratio} fois le loyer, pour un seuil à ${seuil}.`,
  piecesTitre: 'Pièces',
  piecesAucune: 'Aucune pièce déposée pour l’instant.',
  ouvrir: 'Ouvrir',
  ouvrirAide:
    'Chaque ouverture est inscrite au journal, et la pièce vous parvient filigranée à votre nom. Le garant peut voir que vous l’avez consultée.',
  journalTitre: 'Journal des accès',
  journalAucun: 'Personne n’a encore ouvert ce dossier.',
  actionsTitre: 'Décision',
  prendre: 'Prendre le dossier',
  prendreAide:
    'Fige les pièces : le garant ne peut plus rien retirer. À faire quand vous avez ce qu’il vous faut pour décider.',
  refuser: 'Refuser le dossier',
  refuserAide: 'Le locataire est informé du refus, sans le motif.',
  prisTexte:
    'Dossier pris. Les pièces sont figées ; l’acte de cautionnement arrive au prochain chantier.',
  refuseTexte: 'Dossier refusé.',
} as const

/** Les statuts vus par l'agence : ici, dire pourquoi est permis. */
export const statuts: Record<
  string,
  { libelle: string; ton: 'sky' | 'sun' | 'mint' | 'flame' | 'paper' }
> = {
  ouvert: { libelle: 'Ouvert', ton: 'sky' },
  depot_en_cours: { libelle: 'Dépôt en cours', ton: 'sun' },
  complet: { libelle: 'Complet', ton: 'mint' },
  garant_insuffisant: { libelle: 'Garant insuffisant', ton: 'flame' },
  transmis: { libelle: 'Pris', ton: 'mint' },
  signe: { libelle: 'Signé', ton: 'mint' },
  refuse: { libelle: 'Refusé', ton: 'paper' },
  expire: { libelle: 'Expiré', ton: 'paper' },
}

export const natures: Record<string, string> = {
  bulletin_paie: 'Bulletin de paie',
  avis_imposition: 'Avis d’imposition',
  piece_identite: 'Pièce d’identité',
  justificatif_domicile: 'Justificatif de domicile',
  contrat_travail: 'Contrat de travail',
}

export const actions: Record<string, string> = {
  dossier_consulte: 'a consulté le dossier',
  piece_deposee: 'a déposé une pièce',
  piece_retiree: 'a retiré une pièce',
  piece_ouverte: 'a ouvert une pièce',
  dossier_transmis: 'a pris le dossier',
}

export const acteurs: Record<string, string> = {
  agence: 'L’agence',
  garant: 'Le garant',
  locataire: 'Le locataire',
}
