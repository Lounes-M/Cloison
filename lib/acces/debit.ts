import 'server-only'

import { createHmac } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import { cleMaitresse } from '@/lib/coffre/cle-maitresse'

/**
 * Combien de fois, et en combien de temps.
 *
 * Le comptage vit dans Postgres, partage par toutes les instances : une limite
 * gardee en memoire ne borne qu'une fonction serverless a la fois, et un
 * attaquant reparti passe a cote.
 *
 * Ce qui part vers Supabase n'est jamais l'adresse IP ni l'adresse e-mail,
 * mais une empreinte calculee avec un secret qui vit chez Vercel. C'est le
 * meme partage que l'ADR 0003 : la donnee d'un cote, la cle de l'autre. Qui
 * obtiendrait la table `debits` n'y lirait pas qui a essaye quoi.
 */

/** Ce qu'on limite. Les plafonds, eux, vivent dans la migration 0008. */
export type SujetDeDebit = 'demande_agence' | 'lien_locataire' | 'lien_garant' | 'ouverture_dossier'

/**
 * Une cle derivee de la cle maitresse, et non la cle maitresse elle-meme.
 *
 * Se servir d'un meme secret pour chiffrer et pour marquer est le genre de
 * raccourci qui ne casse rien aujourd'hui et complique tout le jour ou l'un des
 * deux usages est attaque. La separation coute une ligne.
 */
function cleDesEmpreintes(): Buffer {
  return createHmac('sha256', cleMaitresse()).update('cloison:debit:v1').digest()
}

/**
 * L'empreinte d'une cible.
 *
 * Normalisee avant d'etre marquee, sans quoi `Marie@Exemple.fr ` et
 * `marie@exemple.fr` compteraient pour deux et la limite se contournerait avec
 * une majuscule.
 */
export function empreinteDe(cible: string): string {
  return createHmac('sha256', cleDesEmpreintes()).update(cible.trim().toLowerCase()).digest('hex')
}

/**
 * Consomme une unite, et dit si elle passe.
 *
 * Refuse quand la base ne repond pas. Laisser passer parce qu'on n'a pas su
 * compter reviendrait a desactiver la limite au moment precis ou quelqu'un
 * s'acharne dessus. Le cout est nul en pratique : ce que ces limites protegent
 * a besoin de la base juste apres.
 */
export async function consommerDebit(
  supabase: SupabaseClient,
  sujet: SujetDeDebit,
  cible: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('consommer_debit', {
    le_sujet: sujet,
    l_empreinte: empreinteDe(cible),
  })

  if (error) {
    console.error('[debit] comptage impossible', sujet, error)
    return false
  }

  return data === true
}
