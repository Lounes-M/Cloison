/**
 * Les etapes du dossier, vues par le locataire (tutoye) et par le garant
 * (vouvoye). Aucune etape ne dit pourquoi : le statut suffit, et le garant
 * n'apprend jamais si son ratio passe le seuil de l'agence.
 */
export const frise = {
  etats: {
    fait: 'terminée',
    encours: 'en cours',
    avenir: 'à venir',
    arrete: 'interrompue',
  },
  locataire: {
    titre: 'Où en est ton dossier',
    etapes: {
      ouverture: 'Dossier ouvert',
      garant: 'Garant désigné',
      depot: 'Dépôt de ton garant',
      decision: 'Décision de l’agence',
      signature: 'Acte signé',
    },
  },
  garant: {
    titre: 'Où en est le dossier',
    etapes: {
      invitation: 'Invitation reçue',
      depot: 'Vos pièces et votre déclaration',
      decision: 'Décision de l’agence',
      signature: 'Acte signé',
    },
  },
} as const
