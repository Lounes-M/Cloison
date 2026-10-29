'use server'

import { revalidatePath } from 'next/cache'

import { formulaireDuDossier } from '@/lib/acces/formulaire'
import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { candidature } from '@/lib/content/candidature'
import { prevenirSiLeStatutAChange } from '@/lib/courriels/notifications'
import { sessionPorteur } from '@/lib/content/session-porteur'
import { codeDeCandidature } from '@/lib/validation/candidature'

export type EtatCandidature =
  | { statut: 'inactif' }
  | { statut: 'transmis'; agence: string }
  | { statut: 'erreur'; message: string }

/**
 * Le locataire rejoint un logement avec le code de l'annonce (0070).
 *
 * Seul le porteur du lien locataire peut le faire, avec son accord coche ;
 * la base verifie le reste (agence verifiee, logement ouvert, dossier libre).
 */
export async function candidaterAuLogement(
  _p: EtatCandidature,
  donnees: FormData,
): Promise<EtatCandidature> {
  const porteur = await capaciteDepuisCookies()
  if (!porteur || porteur.capacite.partie !== 'locataire') {
    return { statut: 'erreur', message: candidature.espace.erreur }
  }
  if (!formulaireDuDossier(donnees, porteur.capacite.dossierId)) {
    return { statut: 'erreur', message: sessionPorteur.autreDossier }
  }
  const code = codeDeCandidature(String(donnees.get('code') ?? ''))
  if (!code) return { statut: 'erreur', message: candidature.espace.erreur }
  if (donnees.get('accord') !== 'on') {
    return { statut: 'erreur', message: candidature.espace.accord }
  }
  const db = clientPorteurDeLien(porteur.jeton)
  const { data, error } = await db.rpc('candidater_au_logement', { le_code: code })
  if (error || typeof data !== 'string') {
    if (error) console.error('[candidature] rattachement refuse')
    return { statut: 'erreur', message: candidature.espace.erreur }
  }
  await prevenirSiLeStatutAChange(db, porteur.capacite.dossierId, null)
  revalidatePath('/locataire')
  return { statut: 'transmis', agence: data }
}
