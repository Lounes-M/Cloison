'use server'

import { revalidatePath } from 'next/cache'

import { logements as texte } from '@/lib/content/logements'
import { montantEnCents } from '@/lib/garant/validation'
import { estUuidCanonique } from '@/lib/validation/uuid'
import { contexteAgence } from './contexte'

/**
 * Les logements de l'agence (migration 0069).
 *
 * Droits, appartenance et rattachement sont tenus en base : politique par
 * agence, et declencheur qui refuse un logement d'une autre agence ou le
 * dossier d'un second garant. Ces actions n'empruntent que ces droits.
 */

export type EtatLogement =
  { statut: 'inactif' } | { statut: 'enregistre' } | { statut: 'erreur'; message: string }

export async function creerUnLogement(_p: EtatLogement, donnees: FormData): Promise<EtatLogement> {
  const libelle = String(donnees.get('libelle') ?? '').trim()
  const loyer = montantEnCents(String(donnees.get('loyer') ?? ''))
  if (libelle.length === 0 || libelle.length > 120) {
    return { statut: 'erreur', message: texte.erreurs.libelle }
  }
  if (loyer === 'invalide') return { statut: 'erreur', message: texte.erreurs.loyer }

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: texte.erreurs.session }

  const { error } = await contexte.supabase
    .from('logements')
    .insert({ agence_id: contexte.agence.id, libelle, loyer_cents: loyer })
  if (error) {
    console.error('[agence] logement non cree')
    return { statut: 'erreur', message: texte.erreurs.general }
  }
  revalidatePath('/espace/logements')
  return { statut: 'enregistre' }
}

/** Archiver ou reactiver : un formulaire d'un seul bouton. */
export async function archiverUnLogement(donnees: FormData): Promise<void> {
  const id = String(donnees.get('logement') ?? '')
  const archive = donnees.get('archive') === 'oui'
  if (!estUuidCanonique(id)) return
  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return
  const { error } = await contexte.supabase.from('logements').update({ archive }).eq('id', id)
  if (error) console.error('[agence] logement non archive')
  revalidatePath('/espace/logements')
  revalidatePath(`/espace/logements/${id}`)
}

/** Rattacher un dossier a un logement, ou l'en detacher (valeur vide). */
export async function rattacherAuLogement(
  _p: EtatLogement,
  donnees: FormData,
): Promise<EtatLogement> {
  const dossier = String(donnees.get('dossier') ?? '')
  const brut = String(donnees.get('logement') ?? '')
  const logement = brut === '' ? null : brut
  if (!estUuidCanonique(dossier) || (logement !== null && !estUuidCanonique(logement))) {
    return { statut: 'erreur', message: texte.erreurs.general }
  }
  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: texte.erreurs.session }

  const { data, error } = await contexte.supabase
    .from('dossiers')
    .update({ logement_id: logement })
    .eq('id', dossier)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[agence] rattachement au logement refuse')
    return { statut: 'erreur', message: texte.erreurs.general }
  }
  revalidatePath(`/espace/dossiers/${dossier}`)
  return { statut: 'enregistre' }
}
