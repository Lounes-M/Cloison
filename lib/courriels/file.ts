import 'server-only'
import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ouvrir } from '@/lib/coffre/enveloppe'
import { cleMaitresse } from '@/lib/coffre/cle-maitresse'
import { env } from '@/lib/env'

export async function distribuerCourriels(db: SupabaseClient, identifiant?: string) {
  const { data: reconciliation, error: etat } = await db.rpc('etat_file_courriels')
  if (etat) throw new Error('Etat des courriels indisponible')
  const { data, error } = await db.rpc('prendre_courriels', {
    identifiant: identifiant ?? null,
  })
  if (error) throw new Error('File de courriels indisponible')
  let echecs = Number(reconciliation ?? 0)
  for (const message of data ?? []) {
    let reussi = false
    try {
      const contenu = JSON.parse(
        ouvrir(Buffer.from(message.contenu, 'base64'), cleMaitresse()).toString('utf8'),
      )
      const resultat = await new Resend(env.resendApiKey).emails.send(contenu, {
        idempotencyKey: `courriel/${message.id}`,
      })
      reussi = !resultat.error
    } catch {
      // Ni contenu, ni adresse, ni lien dans les journaux.
      reussi = false
    }
    const { error: acquittement } = await db.rpc('terminer_courriel', {
      identifiant: message.id,
      le_bail: message.bail,
      reussi,
    })
    if (!reussi || acquittement) echecs++
  }
  return { traites: (data?.length ?? 0) - echecs + Number(reconciliation ?? 0), echecs }
}
