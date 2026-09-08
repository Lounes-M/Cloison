import 'server-only'
import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ouvrirMaitresse } from '@/lib/coffre/rotation-maitresse'

import { env } from '@/lib/env'

export async function distribuerCourriels(
  db: SupabaseClient,
  identifiant?: string,
  signal?: AbortSignal,
) {
  const { error: etat } = await db.rpc('etat_file_courriels')
  if (etat) throw new Error('Etat des courriels indisponible')
  const { data, error } = await db.rpc('prendre_courriels', {
    identifiant: identifiant ?? null,
  })
  if (error) throw new Error('File de courriels indisponible')
  let echecs = 0
  let traites = 0
  for (const message of data ?? []) {
    signal?.throwIfAborted()
    let reussi = false
    let referenceFournisseur: string | null = null
    try {
      const contenu = JSON.parse(
        ouvrirMaitresse(Buffer.from(message.contenu, 'base64')).toString('utf8'),
      )
      // Dix messages maximum par bail : 30 secondes de transport au plus.
      // Le signal traverse le SDK jusqu'a fetch, sans simple course de promesses.
      const options = {
        idempotencyKey: `courriel/${message.id}`,
        signal: AbortSignal.any([AbortSignal.timeout(3_000), ...(signal ? [signal] : [])]),
      }
      const resultat = await new Resend(env.resendApiKey).emails.send(
        { ...contenu, tags: [{ name: 'cloison_id', value: message.id }] },
        options,
      )
      reussi =
        !resultat.error &&
        typeof resultat.data?.id === 'string' &&
        /^[A-Za-z0-9_-]{1,128}$/.test(resultat.data.id)
      if (reussi) referenceFournisseur = resultat.data!.id
    } catch {
      // Ni contenu, ni adresse, ni lien dans les journaux.
      reussi = false
    }
    const { data: confirme, error: acquittement } = await db.rpc('acquitter_courriel', {
      identifiant: message.id,
      le_bail: message.bail,
      reference_fournisseur: referenceFournisseur,
    })
    if (!reussi || acquittement || confirme !== true) echecs++
    else traites++
  }
  // prendre_courriels peut avoir decouvert une issue ancienne pendant ce passage.
  const { data: reconciliation, error: bilan } = await db.rpc('etat_file_courriels')
  if (bilan) throw new Error('Etat des courriels indisponible')
  return { traites, echecs: echecs + Number(reconciliation ?? 0) }
}
