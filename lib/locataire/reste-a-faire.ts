/**
 * Ce qu'il reste au locataire, dans l'ordre ou le dossier en a besoin.
 *
 * Trois gestes seulement lui reviennent : le loyer, sans lequel le garant ne
 * peut pas etre juge ; le reglement, quand le dossier n'a pas d'agence ; et la
 * designation du garant, dont le lien attend ce reglement (0018). Le reste se
 * passe chez le garant, et la cloison veut que le locataire n'en voie que
 * l'avancement : aucune etape ici ne parle de ses pieces.
 */
export type EtapeLocataire = 'loyer' | 'paiement' | 'garant'

export function resteAFaireLocataire({
  loyerDeclare,
  aRegler,
  garantDesigne,
}: {
  loyerDeclare: boolean
  aRegler: boolean
  garantDesigne: boolean
}): EtapeLocataire[] {
  const etapes: EtapeLocataire[] = []
  if (!loyerDeclare) etapes.push('loyer')
  if (aRegler) etapes.push('paiement')
  if (!garantDesigne) etapes.push('garant')
  return etapes
}
