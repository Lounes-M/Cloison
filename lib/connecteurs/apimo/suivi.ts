/**
 * La ligne inscrite sur la fiche Apimo : la reference du dossier et son etat
 * neutre (ADR 0008). Aucun nom, courriel, montant, ratio ou piece. Le texte
 * est en francais : il s'adresse a l'agence, dans son logiciel.
 */
export const ETATS_RETOUR = ['a_completer', 'pret', 'en_cours', 'signe', 'clos'] as const
export type EtatRetour = (typeof ETATS_RETOUR)[number]

const LIBELLES: Record<EtatRetour, string> = {
  a_completer: 'à compléter',
  pret: 'prêt à examiner',
  en_cours: 'en cours de décision',
  signe: 'acte signé',
  clos: 'clos',
}

export function messageDeSuivi(reference: string, etat: EtatRetour, bail: string | null): string {
  if (!/^[A-Za-z0-9+/=_-]{8,32}$/.test(reference)) throw new Error('Reference invalide')
  const suite = bail ? ` (bail ${bail})` : ''
  return `Cloison, dossier de garantie ${reference}${suite} : ${LIBELLES[etat]}.`
}
