'use server'
import { join } from 'node:path'
import { z } from 'zod'
import { contexteAgence } from '@/lib/agences/contexte'
import { clientServeur } from '@/lib/acces/serveur'
import { consommerDebit } from '@/lib/acces/debit'
import { executerProcessus } from '@/lib/coffre/processus-limite'
import { configurationParcours } from './configuration-parcours'
import { PAGES_ACTE_MAX } from './position'
import { signature as t } from '@/lib/content/signature'
import type { EtatApercuActe } from './apercu-types'

const dimension = z.number().positive().max(12000)
const sortie = z.strictObject({
  pages: z
    .array(z.strictObject({ largeur: dimension, hauteur: dimension }))
    .min(1)
    .max(PAGES_ACTE_MAX),
  png: z
    .string()
    .min(12)
    .max(2800000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
})
export async function apercevoirActe(form: FormData): Promise<EtatApercuActe> {
  try {
    if (!configurationParcours()) throw new Error()
    const dossier = z.uuid().parse(form.get('dossier'))
    const page = z.coerce.number().int().min(1).max(PAGES_ACTE_MAX).parse(form.get('page'))
    const fichier = form.get('pdf')
    if (!(fichier instanceof File) || fichier.size < 8 || fichier.size > 4 * 1024 * 1024)
      throw new Error()
    const c = await contexteAgence()
    if (c.etat !== 'rattache' || c.agence.statut !== 'verifiee') throw new Error()
    const { data: d, error } = await c.supabase
      .from('dossiers')
      .select('id,statut,expire_le,demonstration')
      .eq('id', dossier)
      .maybeSingle()
    if (
      error ||
      !d ||
      d.id !== dossier ||
      d.statut !== 'transmis' ||
      d.demonstration ||
      !(Date.parse(d.expire_le) > Date.now())
    )
      throw new Error()
    const db = await clientServeur(AbortSignal.timeout(3000))
    const limites = await Promise.all([
      consommerDebit(db, 'depot_dossier', `apercu-acte:${c.utilisateurId}`),
      consommerDebit(db, 'depot_global', 'tous-les-depots'),
    ])
    if (!limites.every(Boolean)) return { message: t.apercuLimite }
    const pdf = Buffer.from(await fichier.arrayBuffer())
    const resultat = await executerProcessus(
      join(process.cwd(), 'workers', 'apercu-acte.mjs'),
      Buffer.from(JSON.stringify({ contenu: pdf.toString('base64'), page })),
      { sortieMax: 3 * 1024 * 1024 },
    )
    const apercu = sortie.parse(JSON.parse(resultat.toString('utf8')))
    const image = Buffer.from(apercu.png, 'base64')
    if (
      page > apercu.pages.length ||
      image.toString('base64') !== apercu.png ||
      image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    )
      throw new Error()
    return { message: t.apercuPret, apercu: { ...apercu, page } }
  } catch {
    return { message: t.apercuErreur }
  }
}
