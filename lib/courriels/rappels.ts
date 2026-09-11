import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { scellerMaitresse } from '@/lib/coffre/rotation-maitresse'
import { env } from '@/lib/env'
import { courrielsRappels as t } from '@/lib/content/rappels'
import { adresseDuSite } from './envoi'
const rappel = z.object({
  id: z.uuid(),
  dossier_id: z.uuid(),
  reference: z.string().min(8).max(32),
  nature: z.enum(['depot', 'echeance']),
  email: z.email().max(180),
  expiration: z.iso.datetime({ offset: true }),
})
export async function preparerRappels(db: SupabaseClient, signal?: AbortSignal) {
  const { data: compte, error: planification } = await db.rpc('programmer_rappels')
  if (planification || !Number.isInteger(compte) || compte < 0 || compte > 20)
    throw new Error('Planification des rappels indisponible')
  const { data, error } = await db.rpc('rappels_a_preparer')
  const resultat = z.array(rappel).max(20).safeParse(data)
  if (error || !resultat.success) throw new Error('Rappels indisponibles')
  let echecs = 0
  for (const r of resultat.data) {
    signal?.throwIfAborted()
    const date = new Date(r.expiration).toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      dateStyle: 'long',
      timeStyle: 'short',
    })
    const texte = `${t[r.nature].texte}\n\n${t.reference} : ${r.reference}\n${t.expiration} : ${date}${r.nature === 'echeance' ? `\n\n${adresseDuSite()}/espace/dossiers/${r.dossier_id}` : ''}\n\nCloison`
    const contenu = {
      from: env.emailExpediteur,
      ...(env.emailSupport ? { replyTo: env.emailSupport } : {}),
      to: [r.email],
      subject: t[r.nature].sujet,
      text: texte,
    }
    const { data: confirmation, error: refus } = await db.rpc('mettre_rappel_en_file', {
      identifiant: r.id,
      chiffre: scellerMaitresse(Buffer.from(JSON.stringify(contenu))).toString('base64'),
    })
    if (refus || !['prepare', 'obsolete'].includes(confirmation)) echecs++
  }
  return { echecs }
}
