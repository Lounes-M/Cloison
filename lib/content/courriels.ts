/**
 * Ce que les courriels disent, statut par statut.
 *
 * Deux regles. Aucun courriel au locataire ou au garant ne contient de lien :
 * en emettre un nouveau revoquerait celui qu'ils tiennent, et une session en
 * cours tomberait. Ils reviennent par le lien qu'ils ont recu. Et aucun
 * libelle adresse au locataire ne contient de chiffre : le statut est tout ce
 * qu'il apprend, comme a l'ecran.
 */

export const locataire: Record<string, { sujet: string; texte: string }> = {
  complet: {
    sujet: 'Ton dossier est complet',
    texte:
      'Ton garant a déposé ses pièces et il est éligible. L’agence a maintenant tout ce qu’il lui faut pour décider. Tu n’as rien à faire : elle revient vers toi.',
  },
  garant_insuffisant: {
    sujet: 'Ton dossier a besoin d’un autre garant',
    texte:
      'Le dossier n’ira pas plus loin avec ce garant. Pour solliciter une autre personne, ouvre un nouveau dossier : les données de ce garant restent isolées.',
  },
  transmis: {
    sujet: 'L’agence a pris ton dossier',
    texte:
      'L’agence a pris ton dossier pour décider dessus. Les pièces et la déclaration de ton garant sont maintenant figées. Tu seras prévenu de la suite.',
  },
  refuse: {
    sujet: 'Ton dossier n’a pas été retenu',
    texte:
      'L’agence n’a pas retenu ce dossier. Tu peux en ouvrir un nouveau pour un autre logement, avec un autre garant ou le même.',
  },
}

export const garant: Record<string, { sujet: string; texte: string }> = {
  transmis: {
    sujet: 'L’agence a pris le dossier',
    texte:
      'L’agence a pris le dossier auquel tu te portes garant. Tes pièces et ta déclaration sont figées. Tu peux consulter tes originaux et l’historique des accès depuis ton dépôt. Cette transmission ne constitue pas une signature.',
  },
  refuse: {
    sujet: 'Le dossier n’a pas été retenu',
    texte:
      'L’agence n’a pas retenu le dossier auquel tu te portais garant. Tes pièces seront détruites à l’échéance du dossier ; tu n’as rien à faire.',
  },
}

export const agence: Record<string, { sujet: (reference: string) => string; texte: string }> = {
  complet: {
    sujet: (reference) => `Dossier ${reference} complet`,
    texte:
      'Le garant a déposé ses pièces et son ratio passe votre seuil. Le dossier est prêt à être pris.',
  },
  garant_insuffisant: {
    sujet: (reference) => `Dossier ${reference} : garant insuffisant`,
    texte:
      'Le garant a déposé ses pièces, mais son ratio est sous votre seuil. Le locataire en est informé. Un autre garant nécessite un nouveau dossier.',
  },
}

export const pied = 'Cloison'
