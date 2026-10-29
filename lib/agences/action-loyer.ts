'use server'

import { revalidatePath } from 'next/cache'

import { loyerAgence as texte } from '@/lib/content/espace'
import { prevenirSiLeStatutAChange, statutActuel } from '@/lib/courriels/notifications'
import { montantEnCents } from '@/lib/garant/validation'
import { estUuidCanonique } from '@/lib/validation/uuid'
import { contexteAgence } from './contexte'

/**
 * L'agence fixe ou corrige le loyer d'un de ses dossiers.
 *
 * La migration 0011 accorde deja `loyer_cents` a `authenticated` sur ses
 * dossiers ; le verrou de la 0020 le fige des que le garant a declare, et la
 * 0067 refuse l'ecriture directe sur le dossier d'un second garant. Cette
 * action ne fait qu'emprunter ce droit.
 */

export type EtatLoyerAgence =
  | { statut: 'inactif' }
  | { statut: 'enregistre' }
  | { statut: 'erreur'; message: string; valeur?: string }

export async function fixerLeLoyer(
  _p: EtatLoyerAgence,
  donnees: FormData,
): Promise<EtatLoyerAgence> {
  const id = String(donnees.get('dossier') ?? '')
  const saisie = String(donnees.get('loyer') ?? '')
  const cents = montantEnCents(saisie)
  if (!estUuidCanonique(id) || cents === 'invalide' || cents === null) {
    return { statut: 'erreur', message: texte.invalide, valeur: saisie }
  }

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: 'Session expirée.' }

  try {
    const avant = await statutActuel(contexte.supabase, id)
    const { data, error } = await contexte.supabase
      .from('dossiers')
      .update({ loyer_cents: cents })
      .eq('id', id)
      .is('dossier_principal', null)
      .in('statut', ['ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant'])
      .select('id')
      .maybeSingle()
    if (error || !data) {
      if (error) console.error('[agence] loyer refuse')
      return { statut: 'erreur', message: texte.erreur, valeur: saisie }
    }
    await prevenirSiLeStatutAChange(contexte.supabase, id, avant)
  } catch {
    console.error('[agence] loyer impossible')
    return { statut: 'erreur', message: texte.erreur, valeur: saisie }
  }

  revalidatePath(`/espace/dossiers/${id}`)
  return { statut: 'enregistre' }
}
