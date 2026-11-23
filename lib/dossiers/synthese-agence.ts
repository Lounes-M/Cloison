import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { filigranePour } from '@/lib/coffre/ouverture'
import { rasteriser } from '@/lib/coffre/rasterisation'
import { natures as naturesEn } from '@/lib/content/en/espace'
import { synthese as tEn } from '@/lib/content/en/synthese'
import { natures as naturesFr } from '@/lib/content/espace'
import { synthese as tFr } from '@/lib/content/synthese'
import { choisir, type Langue } from '@/lib/i18n'

import { dessinerSynthese, donneesSynthese } from './synthese-bailleur'

/**
 * La synthese telle que l'agence la recoit pour le bailleur.
 *
 * Meme ordre que l'ouverture d'une piece (ADR 0004) : la base inscrit le
 * telechargement au journal dans la transaction qui rend les donnees, puis la
 * page est dessinee, rasterisee et filigranee au nom de la personne connectee.
 * Ce qui part n'est donc jamais le PDF dessine, dont le texte se copierait et
 * dont la marque s'enleverait, mais sa photographie.
 *
 * Un refus de la base (dossier d'une autre agence, echu, pas encore complet,
 * plafond atteint) et une absence se lisent pareil.
 */
export type Synthese =
  { ok: true; pdf: Buffer; reference: string } | { ok: false; motif: 'refus' | 'indisponible' }

export async function synthesePourLeBailleur(
  supabase: SupabaseClient,
  dossier: string,
  email: string,
  langue: Langue,
  maintenant: Date = new Date(),
): Promise<Synthese> {
  const { data, error } = await supabase.rpc('preparer_synthese_bailleur', { le_dossier: dossier })
  if (error) {
    console.error('[synthese] preparation refusee')
    return { ok: false, motif: 'refus' }
  }
  if (data === null) return { ok: false, motif: 'refus' }

  const lecture = donneesSynthese.safeParse(data)
  if (!lecture.success) {
    console.error('[synthese] donnees inattendues')
    return { ok: false, motif: 'indisponible' }
  }

  try {
    const clair = await dessinerSynthese(lecture.data, {
      langue,
      textes: choisir(langue, tFr, tEn).pdf,
      natures: choisir(langue, naturesFr, naturesEn),
      le: maintenant,
    })
    return {
      ok: true,
      pdf: await rasteriser(
        Buffer.from(clair),
        'application/pdf',
        filigranePour(email, maintenant),
      ),
      reference: lecture.data.reference,
    }
  } catch {
    // Sans filigrane, rien ne part : le PDF dessine ne quitte pas le serveur.
    console.error('[synthese] production impossible')
    return { ok: false, motif: 'indisponible' }
  }
}
