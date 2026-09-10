import 'server-only'
import { z } from 'zod'
import { contexteAgence } from '@/lib/agences/contexte'
import { baseOuvertureSupabase } from '@/lib/coffre/ouverture-supabase'
import { filigranePour, ouvrirPiecePourLAgence } from '@/lib/coffre/ouverture'
import { configurationOcr, extraireTexte } from './openrouter'

const repondre = (statut: number, valeur: unknown = null) =>
  Response.json(valeur, { status: statut, headers: { 'Cache-Control': 'no-store' } })
export async function lirePieceParOcr(requete: Request, id: string) {
  try {
    if (!z.uuid().safeParse(id).success) return repondre(404)
    if (
      requete.headers.get('origin') !== new URL(requete.url).origin ||
      requete.headers.get('x-cloison-ocr') !== 'lecture-explicite'
    )
      return repondre(403)
    const configuration = configurationOcr()
    if (!configuration) return repondre(503)
    const contexte = await contexteAgence()
    if (contexte.etat !== 'rattache') return repondre(401)
    const { data, error } = await contexte.supabase.rpc('reserver_lecture_ocr', { la_piece: id })
    if (error || data !== true) return repondre(404)
    const base = baseOuvertureSupabase(contexte.supabase)
    const ouverture = await ouvrirPiecePourLAgence(base, id, filigranePour(contexte.email))
    if (!ouverture.ouverte) return repondre(404)
    const resultat = await extraireTexte(ouverture.pdf, configuration, requete.signal)
    // Ne pas rendre une transcription lorsque les droits ont expire pendant l'appel.
    if (!(await base.piece(id))) return repondre(404)
    return repondre(200, resultat)
  } catch {
    return repondre(503)
  }
}
