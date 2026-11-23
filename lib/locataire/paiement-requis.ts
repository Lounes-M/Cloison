/**
 * Le dossier attend-il encore le paiement du locataire ?
 *
 * Le lien du garant est ce que le locataire achete. Il en est dispense quand
 * l'agence l'invite (elle ouvre le dossier, ou il entre par le lien de
 * candidature d'un logement) et dans la demonstration. Un rattachement qu'il
 * fait seul, par le nom de domaine de l'agence, ne le dispense pas (0085).
 * La base tranche (`dossier_a_regler`) ; ceci ne sert qu'a l'ecran.
 */
export const COLONNES_PAIEMENT = 'paye_le, agence_id, demonstration, rattache_par_locataire'

export function resteARegler(dossier: {
  paye_le?: unknown
  agence_id?: unknown
  demonstration?: unknown
  rattache_par_locataire?: unknown
}): boolean {
  return (
    !dossier.paye_le &&
    !dossier.demonstration &&
    (!dossier.agence_id || dossier.rattache_par_locataire === true)
  )
}
