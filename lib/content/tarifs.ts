/**
 * Les montants, ecrits une seule fois.
 *
 * Decides le 4 septembre 2026, a l'ouverture de la phase 6. En centimes,
 * comme tout ce qui compte de l'argent dans ce depot : un montant ne se stocke
 * pas en flottant.
 */

export const tarifs = {
  /** Le locataire, une fois, pour un dossier valable trois mois. */
  locataireCents: 900,
  versionLocataire: 'locataire-2026-09-04',

  /** L'agence, par acte signe et archive. Consulter reste gratuit. */
  acteCents: 2900,

  /** Le garant. Il n'y a pas de montant parce qu'il n'y en aura jamais. */
} as const

export const euros = (centimes: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(centimes / 100)
export const prixLocataire = euros(tarifs.locataireCents)
export const prixActe = euros(tarifs.acteCents)

export const paiementLocataire = {
  titre: 'Régler ton dossier',
  prix: prixLocataire,
  texte:
    'Une fois, pour trois mois de coffre : ton garant dépose ses pièces de son côté, l’agence reçoit un dossier complet, et tu suis l’avancement.',
  regle:
    'Le paiement n’est pas remboursé si le dossier expire sans décision de l’agence : tu achètes trois mois de coffre, pas un résultat.',
  attente: 'Le lien de ton garant partira une fois le dossier réglé.',
  bouton: `Régler ${prixLocataire}`,
  boutonPour: (montant: number) => `Régler ${euros(montant)}`,
  envoi: 'Redirection…',
  regle_le: (date: string) => `Dossier réglé le ${date}.`,
  indisponible: 'Le paiement n’est pas disponible pour l’instant. Réessaie dans un moment.',
  annule: 'Paiement annulé. Ton dossier reste ouvert : tu peux régler quand tu veux.',
  confirme: 'Merci, ton paiement est enregistré. Tu peux désigner ton garant.',
  enAttente: 'Paiement en cours de confirmation. Rafraîchis dans quelques secondes.',
} as const
