/** La page d'un lien de candidature, en anglais. */
export const candidature = {
  page: {
    titre: 'Apply for this home',
    apercuTitre: (libelle: string, agence: string) => `${libelle}, with ${agence}`,
    apercuTexte: (agence: string) =>
      `Create your rental file on Cloison and send it to ${agence} for this home.`,
    etiquette: 'Application',
    loyer: 'Reference rent',
    sansLoyer: 'Not provided',
    agence: 'Agency',
    ville: 'City',
    surface: 'Floor area',
    pieces: 'Rooms',
    meuble: 'Furnishing',
    meubleOui: 'Furnished',
    meubleNon: 'Unfurnished',
    disponible: 'Available',
    disponibleDes: 'Now',
    intro: (agence: string) =>
      `Create your Cloison file: it will be sent to ${agence} for this home, and to nobody else.`,
    accord: (agence: string) =>
      `I allow ${agence} to view the information and documents in my file for this home. This link to the agency is permanent.`,
    dejaTitre: 'Already have a file?',
    dejaTexte:
      'Open your space with the link you received by email, then paste this link or its code in the “Apply for a home” section.',
    code: 'Application code',
    rattache: 'Your file has joined this home. Open the link you received by email to complete it.',
    nonRattache:
      'Your file is open, but it could not join this home. From your space, paste the listing link in the “Apply for a home” section.',
    invalideTitre: 'This link no longer works',
    invalideTexte:
      'The home may have been let, or the agency may have changed its link. Ask them for the current link, or create your file without an agency: you can send it to them later.',
    invalideBouton: 'Create my file',
  },
  erreurs: {
    accord: 'Tick the consent box so your file can join this home.',
  },
} as const
