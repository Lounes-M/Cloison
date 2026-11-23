import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { courrielsFinDossier as tEn } from '@/lib/content/en/rappels'
import { courrielsFinDossier as tFr } from '@/lib/content/rappels'
import { choisir, locale } from '@/lib/i18n'
import { languesCourriels } from '@/lib/langue-preferee'
import { adresseDuSite, envoyer } from './envoi'
import { composerCourriel } from './gabarit'

/**
 * L'annonce de fin de dossier au locataire et au garant (migration 0085).
 *
 * Sept jours avant l'echeance, chacun apprend que le dossier sera ferme et
 * les justificatifs supprimes. Le courriel ne porte aucun lien de capacite :
 * la personne revient avec son lien habituel. La cle de mise en file est
 * stable par dossier, echeance et destinataire, donc un passage interrompu se
 * rejoue sans doublon ; l'annonce n'est acquittee qu'une fois tout en file.
 */
const annonce = z.object({
  dossier_id: z.uuid(),
  reference: z.string().min(8).max(32),
  email_locataire: z.email().max(180),
  email_garant: z.email().max(180).nullable(),
  expiration: z.iso.datetime({ offset: true }),
  secondaire: z.boolean(),
})

export async function annoncerFinsDeDossier(db: SupabaseClient, signal?: AbortSignal) {
  const { data, error } = await db.rpc('echeances_a_annoncer')
  const resultat = z.array(annonce).max(20).safeParse(data)
  if (error || !resultat.success) throw new Error('Annonces de fin de dossier indisponibles')
  let echecs = 0
  for (const a of resultat.data) {
    signal?.throwIfAborted()
    const destinataires = [
      ...(a.secondaire ? [] : [{ partie: 'locataire' as const, adresse: a.email_locataire }]),
      ...(a.email_garant ? [{ partie: 'garant' as const, adresse: a.email_garant }] : []),
    ]
    const langueDe = await languesCourriels(
      db,
      a.dossier_id,
      destinataires.map((d) => d.adresse),
    )
    let accepte = true
    for (const d of destinataires) {
      signal?.throwIfAborted()
      const langue = langueDe(d.adresse)
      const t = choisir(langue, tFr, tEn)
      const corps = composerCourriel(
        {
          langue,
          espace: d.partie,
          sujet: t[d.partie].sujet,
          paragraphes: [t[d.partie].texte],
          details: [
            { libelle: t.reference, valeur: a.reference },
            {
              libelle: t.expiration,
              valeur: new Date(a.expiration).toLocaleString(locale(langue), {
                timeZone: 'Europe/Paris',
                dateStyle: 'long',
                timeStyle: 'short',
              }),
            },
          ],
        },
        adresseDuSite(),
      )
      const hex = createHash('sha256')
        .update(`fin:${a.dossier_id}:${a.expiration}:${d.partie}:${d.adresse.toLowerCase()}`)
        .digest('hex')
        .slice(0, 32)
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
      if (
        !(await envoyer(d.adresse, t[d.partie].sujet, corps, id, undefined, true, { db, signal }))
      )
        accepte = false
    }
    if (!accepte) {
      echecs++
      continue
    }
    const { data: acquitte, error: refus } = await db.rpc('acquitter_alerte_echeance', {
      le_dossier: a.dossier_id,
      l_expiration: a.expiration,
    })
    // `false` : l'echeance a bouge entre-temps, le dossier sera annonce a sa nouvelle date.
    if (refus || typeof acquitte !== 'boolean') echecs++
  }
  return { echecs }
}
