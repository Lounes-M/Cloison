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

export type PastilleSuivi = 'remplacement' | 'sans_nouvelles'

/**
 * Les signaux d'une ligne de la liste, memes regles que les cartes de
 * priorite : un remplacement propose et pas encore examine, ou un dossier en
 * attente qui n'a plus bouge depuis la limite.
 */
export function pastillesDuDossier(
  ligne: {
    statut: string
    activite_rappel_le?: string | null
    suivi?: { etat: string }[] | null
  },
  limite: string,
): PastilleSuivi[] {
  const pastilles: PastilleSuivi[] = []
  if (ligne.suivi?.some((c) => c.etat === 'fourni')) pastilles.push('remplacement')
  const activite = ligne.activite_rappel_le ? Date.parse(ligne.activite_rappel_le) : NaN
  if (
    (STATUTS_EN_ATTENTE as readonly string[]).includes(ligne.statut) &&
    Number.isFinite(activite) &&
    activite < Date.parse(limite)
  )
    pastilles.push('sans_nouvelles')
  return pastilles
}
