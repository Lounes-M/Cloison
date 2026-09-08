import 'server-only'

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clientServeur } from '@/lib/acces/serveur'
import { scellerMaitresse } from '@/lib/coffre/rotation-maitresse'

import { distribuerCourriels } from './file'

import { env } from '@/lib/env'

/**
 * Retourne vrai des que le courriel est durablement accepte en file.
 * Les notifications differees seront distribuees par la maintenance ; les
 * liens tentent aussi une livraison immediate apres leur sauvegarde.
 */
export async function envoyer(
  a: string | string[],
  sujet: string,
  texte: string,
  identifiant?: string,
  repondreA?: string,
  differer = false,
  contexte?: { db: SupabaseClient; signal?: AbortSignal; lien?: boolean },
): Promise<boolean> {
  const destinataires = Array.isArray(a) ? a.filter(Boolean) : [a]
  if (destinataires.length === 0) return false
  try {
    const id = identifiant ?? randomUUID()
    contexte?.signal?.throwIfAborted()
    const db = contexte?.db ?? (await clientServeur())
    const contenu = {
      from: env.emailExpediteur,
      ...((repondreA ?? env.emailSupport) ? { replyTo: repondreA ?? env.emailSupport } : {}),
      to: destinataires,
      subject: sujet,
      text: texte,
    }
    const { data, error } = await db.rpc(
      contexte?.lien ? 'mettre_lien_en_file' : 'mettre_courriel_en_file',
      {
        identifiant: id,
        chiffre: scellerMaitresse(Buffer.from(JSON.stringify(contenu))).toString('base64'),
      },
    )
    if (error || (contexte?.lien && data !== true)) return false
    try {
      if (!differer) await distribuerCourriels(db, id, contexte?.signal)
    } catch {
      console.error('[courriel] reprise necessaire')
    }
    return true
  } catch {
    console.error('[courriel] mise en file impossible')
    return false
  }
}

/** L'adresse publique du site, normalisee par `next.config.ts`. */
export function adresseDuSite(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}
