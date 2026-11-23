import 'server-only'
import { z } from 'zod'

import { contexteAgence } from '@/lib/agences/contexte'
import { baseOuvertureSupabase } from '@/lib/coffre/ouverture-supabase'
import { lireCodePourLAgence } from '@/lib/coffre/ouverture'

import { verifierCode2dDoc } from './verification'

/** Activation explicite, comme toute lecture d'une piece par une machine. */
export function verification2dDocActive() {
  return process.env.VERIFICATION_2DDOC_ACTIVE === 'true'
}

const repondre = (statut: number, valeur: unknown = null) =>
  Response.json(valeur, { status: statut, headers: { 'Cache-Control': 'no-store' } })

/**
 * Verification du code 2D-Doc d'un avis d'imposition, a la demande de l'agence.
 *
 * L'ordre est celui de toute lecture de piece : demande explicite de meme
 * origine, session rattachee, reservation en base (droits, nature de la piece,
 * quota, journal), puis seulement dechiffrement. Le resultat n'est ecrit nulle
 * part et ne modifie ni statut, ni examen, ni decision.
 */
export async function verifierAvisPour(requete: Request, id: string) {
  try {
    if (!z.uuid().safeParse(id).success) return repondre(404)
    if (
      requete.headers.get('origin') !== new URL(requete.url).origin ||
      requete.headers.get('x-cloison-2ddoc') !== 'verification-explicite'
    )
      return repondre(403)
    if (!verification2dDocActive()) return repondre(503)
    const contexte = await contexteAgence()
    if (contexte.etat !== 'rattache') return repondre(401)
    const { data, error } = await contexte.supabase.rpc('reserver_verification_2ddoc', {
      la_piece: id,
    })
    if (error || data !== true) return repondre(404)
    const base = baseOuvertureSupabase(contexte.supabase)
    const code = await lireCodePourLAgence(base, id)
    if (!code) return repondre(503)
    const resultat = await verifierCode2dDoc(code)
    // Ne rien rendre lorsque les droits ont ete retires pendant la verification.
    if (!(await base.piece(id))) return repondre(404)
    return repondre(200, resultat)
  } catch {
    return repondre(503)
  }
}
