'use server'

import { revalidatePath } from 'next/cache'

import { relanceGarant as texte } from '@/lib/content/espace'
import { estUuidCanonique } from '@/lib/validation/uuid'
import { contexteAgence } from './contexte'

export type EtatRelance =
  { statut: 'inactif' } | { statut: 'relance' } | { statut: 'erreur'; message: string }

/**
 * Ouvrir un nouveau cycle de relances automatiques (migration 0079).
 *
 * Tout ce qui protege est en base : agence courante, administrateur ou
 * responsable, dossier en attente du garant et relances du cycle epuisees.
 * Aucun courriel ne part d'ici : la prochaine relance suit le circuit
 * habituel des rappels.
 */
export async function relancerLeGarant(_p: EtatRelance, donnees: FormData): Promise<EtatRelance> {
  const id = String(donnees.get('dossier') ?? '')
  if (!estUuidCanonique(id)) return { statut: 'erreur', message: texte.erreur }

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: 'Session expirée.' }

  const { data, error } = await contexte.supabase.rpc('relancer_garant', { le_dossier: id })
  if (error || data !== true) {
    if (error) console.error('[agence] relance refusee')
    return { statut: 'erreur', message: texte.erreur }
  }

  revalidatePath(`/espace/dossiers/${id}`)
  revalidatePath('/espace')
  return { statut: 'relance' }
}
