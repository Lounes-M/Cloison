/**
 * Ce qu'il reste au locataire, dans l'ordre ou le dossier en a besoin.
 *
 * Trois gestes seulement lui reviennent : le loyer, sans lequel le garant ne
 * peut pas etre juge ; le reglement, quand le dossier n'a pas d'agence ; et la
 * designation du garant, dont le lien attend ce reglement (0018). Tant que le
 * dossier est a regler, designer le garant n'est pas encore un geste possible :
 * on ne le propose pas. Le reste se passe chez le garant, et la cloison veut
 * que le locataire n'en voie que l'avancement : aucune etape ici ne parle de
 * ses pieces.
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
  else if (!garantDesigne) etapes.push('garant')
  return etapes
}

/** Le bandeau d'un dossier `ouvert`, a partir des memes faits que la liste. */
export type DetailOuvert = 'loyer' | 'paiement' | 'garant' | 'attente'

export function detailDossierOuvert({
  loyerDeclare,
  aRegler,
  garantDesigne,
}: {
  loyerDeclare: boolean
  aRegler: boolean
  garantDesigne: boolean
}): DetailOuvert {
  if (!loyerDeclare) return 'loyer'
  if (aRegler) return 'paiement'
  if (!garantDesigne) return 'garant'
  return 'attente'
}
