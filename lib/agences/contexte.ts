import 'server-only'

import { clientAgence, utilisateurCourant } from '@/lib/acces/agence'
import { rattacher, type Rattachement } from './rattachement'

/**
 * Ce que toute page de l'espace agence a besoin de savoir avant de rendre.
 *
 * Qui est connecte, a quelle agence, avec quel role, et si l'agence est
 * verifiee. Une seule fonction, pour que la question soit posee de la meme
 * facon partout : un deuxieme chemin serait un deuxieme endroit ou se tromper.
 */

export type Agence = {
  id: string
  nom: string
  domaine: string
  statut: 'decouverte' | 'verifiee' | 'suspendue'
  seuilRatio: number
}

export type ContexteAgence =
  | { etat: 'anonyme' }
  | {
      etat: 'non-rattache'
      rattachement: Exclude<Rattachement, { etat: 'rattache' }>
      email: string
    }
  | {
      etat: 'rattache'
      email: string
      utilisateurId: string
      agence: Agence
      role: 'admin' | 'membre'
      supabase: Awaited<ReturnType<typeof clientAgence>>
    }

export async function contexteAgence(): Promise<ContexteAgence> {
  const utilisateur = await utilisateurCourant()
  if (!utilisateur) return { etat: 'anonyme' }

  const email = utilisateur.email ?? ''
  const rattachement = await rattacher()
  if (rattachement.etat !== 'rattache') return { etat: 'non-rattache', rattachement, email }

  const supabase = await clientAgence()
  const [{ data: agence }, { data: membre }] = await Promise.all([
    supabase
      .from('agences')
      .select('id, nom, domaine, statut, seuil_ratio')
      .eq('id', rattachement.agenceId)
      .maybeSingle(),
    supabase
      .from('membres_agence')
      .select('role')
      .eq('utilisateur_id', utilisateur.id)
      .maybeSingle(),
  ])

  // Rattache mais sans agence lisible : incoherent, et on ne devine pas.
  if (!agence) return { etat: 'anonyme' }

  return {
    etat: 'rattache',
    email,
    utilisateurId: utilisateur.id,
    agence: {
      id: String(agence.id),
      nom: String(agence.nom),
      domaine: String(agence.domaine),
      statut: agence.statut as Agence['statut'],
      seuilRatio: Number(agence.seuil_ratio),
    },
    role: membre?.role === 'admin' ? 'admin' : 'membre',
    supabase,
  }
}
