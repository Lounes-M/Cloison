/**
 * Un dossier « sans nouvelles » : encore en attente du locataire ou du garant,
 * et sans activite depuis une semaine.
 *
 * L'activite est celle que tiennent les rappels (0052) : un changement de
 * statut, un depot, un retrait, l'engagement ou un complement la remettent a
 * jour. Une consultation par l'agence n'en est pas une, c'est voulu : ce qu'on
 * cherche, c'est un dossier qui n'avance plus de son cote.
 */
export const STATUTS_EN_ATTENTE = ['ouvert', 'depot_en_cours'] as const
export const JOURS_SANS_NOUVELLES = 7

export function limiteSansNouvelles(maintenant = Date.now()): string {
  return new Date(maintenant - JOURS_SANS_NOUVELLES * 86400000).toISOString()
}
