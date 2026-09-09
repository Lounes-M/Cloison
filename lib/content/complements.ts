export const complements = {
  titre: 'Demandes de compléments',
  aideAgence:
    'Une demande rouvre le dépôt du garant. Examinez le remplacement avant de le valider. Les autres informations du dépôt peuvent être corrigées pendant cette réouverture.',
  aideGarant:
    'Ton agence demande une correction. Dépose un nouveau fichier de la meme catégorie, puis associe-le à la demande. Ton dépôt reste modifiable jusqu’à la prochaine transmission.',
  motif: 'Motif de la demande',
  motifs: {
    illisible: 'Document illisible',
    incomplet: 'Document incomplet',
    incorrect: 'Document incorrect',
  },
  etats: {
    demande: 'Nouveau document attendu',
    fourni: 'Remplacement à examiner',
    valide: 'Remplacement validé par l’agence',
  },
  demander: 'Demander un remplacement',
  fournir: 'Proposer ce remplacement',
  valider: 'Valider le remplacement',
  refuser: 'Demander une nouvelle correction',
  remplacement: 'Nouveau fichier',
  aucun: 'Dépose un nouveau fichier dans la catégorie demandee pour pouvoir le proposer.',
  ouvrir: 'Ouvrir le remplacement',
  enregistre: 'Demande mise à jour.',
  erreur: 'Cette operation n’a pas abouti. Actualise la page et vérifie l’état du dossier.',
  choix: 'Choisir un fichier',
  attente: 'Enregistrement...',
}
export type MotifComplement = keyof typeof complements.motifs
export type Complement = {
  id: string
  nature: string
  motif: MotifComplement
  etat: keyof typeof complements.etats
  piece_initiale: string
  piece_fournie: string | null
  cree_le: string
  attendu_depuis: string
}
