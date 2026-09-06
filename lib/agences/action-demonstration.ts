'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { contexteAgence } from './contexte'
import { remplirLaDemonstration } from './demonstration'

/**
 * Ouvrir, ou retrouver, le dossier de demonstration de l'agence.
 *
 * La base decide s'il existe deja (migration 0013). S'il vient de naitre, le
 * serveur le remplit, puis l'agence est emmenee dessus. Aucun etat a rendre :
 * l'action se termine toujours par une redirection, vers le dossier ou vers
 * l'espace.
 */
export async function ouvrirMaDemonstration(): Promise<void> {
  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') redirect('/connexion')

  const { data, error } = await contexte.supabase.rpc('ouvrir_dossier_de_demonstration')
  if (error || typeof data !== 'string') {
    console.error('[demonstration] ouverture refusee')
    redirect('/espace')
  }

  const dossierId = data

  // Neuf, ou deja rempli ? Une piece suffit a le dire : le remplissage depose
  // toujours au moins celle-la en premier.
  const { count } = await contexte.supabase
    .from('pieces')
    .select('id', { count: 'exact', head: true })
    .eq('dossier_id', dossierId)

  if (!count) {
    const complet = await remplirLaDemonstration(dossierId)
    if (!complet) console.error('[demonstration] remplissage incomplet')
  }

  revalidatePath('/espace')
  redirect(`/espace/dossiers/${dossierId}`)
}
