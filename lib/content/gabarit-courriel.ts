/**
 * Ce que tous les courriels de Cloison ont en commun : l'habillage, le pied,
 * les libelles des boutons. Le propos de chaque courriel vit dans
 * `courriels.ts`, `liens.ts` et `rappels.ts`.
 */
export const gabaritCourriel = {
  signature: 'Le coffre à trois clés.',
  reference: 'Référence du dossier',
  echeance: 'Fin du coffre',
  heure: 'heure de Paris',
  boutons: {
    locataire: 'Ouvrir mon dossier',
    garant: 'Ouvrir mon espace',
    agence: 'Ouvrir le dossier',
  },
  lienBrut: 'Si le bouton ne répond pas, ce lien mène au même endroit :',
  pourquoi: 'Ce message concerne un dossier Cloison lié à cette adresse.',
  automatique:
    'Cloison ne demande jamais de mot de passe ni de pièce par courriel. Les pièces se déposent uniquement dans l’espace sécurisé.',
  mentions: 'Mentions légales',
  confidentialite: 'Confidentialité',
} as const
