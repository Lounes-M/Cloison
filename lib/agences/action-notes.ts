'use server'

import { revalidatePath } from 'next/cache'

import { notesDossier as texte } from '@/lib/content/notes'
import { estUuidCanonique } from '@/lib/validation/uuid'
import { contexteAgence } from './contexte'

export type EtatNote =
  | { statut: 'inactif' }
  | { statut: 'ajoutee' }
  | { statut: 'supprimee' }
  | { statut: 'erreur'; message: string; valeur?: string }

/**
 * Ajouter une note interne a un dossier (migration 0081).
 *
 * La base verifie l'agence courante, l'echeance et la longueur ; l'action ne
 * fait que relayer et rafraichir la fiche. Le texte n'est jamais journalise.
 */
export async function ajouterNote(_p: EtatNote, donnees: FormData): Promise<EtatNote> {
  const id = String(donnees.get('dossier') ?? '')
  const saisie = String(donnees.get('texte') ?? '')
  const propre = saisie.trim()
  if (!estUuidCanonique(id) || propre.length === 0 || propre.length > texte.limite) {
    return { statut: 'erreur', message: texte.erreurAjout, valeur: saisie }
  }
  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: 'Session expirée.' }

  const { data, error } = await contexte.supabase.rpc('ajouter_note_dossier', {
    le_dossier: id,
    le_texte: propre,
  })
  if (error || typeof data !== 'string') {
    if (error) console.error('[agence] note refusee')
    return { statut: 'erreur', message: texte.erreurAjout, valeur: saisie }
  }
  revalidatePath(`/espace/dossiers/${id}`)
  return { statut: 'ajoutee' }
}

/** Supprimer une note : son auteur ou un administrateur, la base tranche. */
export async function supprimerNote(_p: EtatNote, donnees: FormData): Promise<EtatNote> {
  const id = String(donnees.get('dossier') ?? '')
  const note = String(donnees.get('note') ?? '')
  if (!estUuidCanonique(id) || !estUuidCanonique(note)) {
    return { statut: 'erreur', message: texte.erreurSuppression }
  }
  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: 'Session expirée.' }

  const { data, error } = await contexte.supabase.rpc('supprimer_note_dossier', { la_note: note })
  if (error || data !== true) {
    if (error) console.error('[agence] suppression de note refusee')
    return { statut: 'erreur', message: texte.erreurSuppression }
  }
  revalidatePath(`/espace/dossiers/${id}`)
  return { statut: 'supprimee' }
}
