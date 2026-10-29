import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PositionSignature } from '@/lib/signature/position'
import { donneesDepuisDossier } from './donnees-dossier'
import { ActeIncomplet, type RefusActe } from './modele-cautionnement'
import { genererActePdf, TexteNonImprimable } from './pdf-cautionnement'

export type MotifRefusProjet = 'saisie' | 'dossier' | 'mention' | 'caracteres' | RefusActe

export type ProjetDossier =
  | { ok: true; pdf: Uint8Array; signature: PositionSignature }
  | { ok: false; motif: MotifRefusProjet }

/** Du dossier et du complement de l'agence jusqu'au PDF, avec un motif lisible en cas de refus. */
export async function projetDepuisDossier(
  supabase: SupabaseClient,
  dossier: string,
  form: FormData,
  agence: string,
): Promise<ProjetDossier> {
  const lecture = await donneesDepuisDossier(supabase, dossier, form, agence)
  if (!lecture.ok) return lecture
  try {
    const { pdf, signature } = await genererActePdf(lecture.donnees)
    return { ok: true, pdf, signature }
  } catch (e) {
    if (e instanceof ActeIncomplet) return { ok: false, motif: e.motif }
    if (e instanceof TexteNonImprimable) return { ok: false, motif: 'caracteres' }
    throw e
  }
}
