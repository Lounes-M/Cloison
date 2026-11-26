/**
 * Les etapes du dossier, vues par le locataire (tutoye) et par le garant
 * (vouvoye). Aucune etape ne dit pourquoi : le statut suffit, et le garant
 * n’apprend jamais si son ratio passe le seuil de l’agence.
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
      garantADesigner: 'Garant à désigner',
      depot: 'Dépôt de ton garant',
      rattachement: 'Rattachement à ton agence',
      decision: 'Décision de l’agence',
      signature: 'Acte signé',
    },
  },
  garant: {
    titre: 'Où en est le dossier',
    etapes: {
      invitation: 'Invitation reçue',
      depot: 'Vos pièces et votre déclaration',
      attenteAgence: 'En attente d’une agence',
      decision: 'Décision de l’agence',
      signature: 'Acte signé',
    },
  },
} as const
