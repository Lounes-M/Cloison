import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { scellerMaitresse } from '@/lib/coffre/rotation-maitresse'
import { env } from '@/lib/env'
import { courrielsRappels as tFr } from '@/lib/content/rappels'
import { adresseDuSite } from './envoi'
import { courrielsRappels as tEn } from '@/lib/content/en/rappels'
import { choisir } from '@/lib/i18n'
import { languesCourriels } from '@/lib/langue-preferee'
import { composerCourriel } from './gabarit'
import { locale } from '@/lib/i18n'
const rappel = z.object({
  id: z.uuid(),
  dossier_id: z.uuid(),
  reference: z.string().min(8).max(32),
  nature: z.enum(['depot', 'echeance', 'epuise']),
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
    // Le rappel de depot va au garant, les deux autres a l'agence : chacun
    // le lit dans sa langue.
    const langue = (await languesCourriels(db, r.dossier_id, [r.email]))(r.email)
    const t = choisir(langue, tFr, tEn)
    const date = new Date(r.expiration).toLocaleString(locale(langue), {
      timeZone: 'Europe/Paris',
      dateStyle: 'long',
      timeStyle: 'short',
    })
    const corps = composerCourriel(
      {
        langue,
        espace: r.nature === 'depot' ? 'garant' : 'agence',
        sujet: t[r.nature].sujet,
        paragraphes: [t[r.nature].texte],
        ...(r.nature !== 'depot'
          ? { bouton: { url: `${adresseDuSite()}/espace/dossiers/${r.dossier_id}` } }
          : {}),
        details: [
          { libelle: t.reference, valeur: r.reference },
          { libelle: t.expiration, valeur: date },
        ],
      },
      adresseDuSite(),
    )
    const contenu = {
      from: env.emailExpediteur,
      ...(env.emailSupport ? { replyTo: env.emailSupport } : {}),
      to: [r.email],
      subject: t[r.nature].sujet,
      text: corps.text,
      html: corps.html,
    }
    const { data: confirmation, error: refus } = await db.rpc('mettre_rappel_en_file', {
      identifiant: r.id,
      chiffre: scellerMaitresse(Buffer.from(JSON.stringify(contenu))).toString('base64'),
    })
    if (refus || !['prepare', 'obsolete'].includes(confirmation)) echecs++
  }
  return { echecs }
}
