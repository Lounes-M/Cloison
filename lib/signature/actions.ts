'use server'
import { randomBytes, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { contexteAgence } from '@/lib/agences/contexte'
import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { clientServeur } from '@/lib/acces/serveur'
import { formulaireDuDossier } from '@/lib/acces/formulaire'
import { sceller } from '@/lib/coffre/enveloppe'
import { scellerMaitresse } from '@/lib/coffre/rotation-maitresse'
import { signature } from '@/lib/content/signature'
import { echeanceActe } from './echeance'
import { configurationParcours } from './configuration-parcours'
import { empreintePdf } from './archive-format'
import { archiverFichier, ouvrirContexteActe } from './parcours'
import { contexteActe, dossierActe } from './parcours-types'
export type EtatActe = { message: string; id?: string }
const bytea = (b: Buffer) => `\\x${b.toString('hex')}`
const saisie = z.object({
  dossier: z.uuid(),
  telephone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  page: z.coerce.number().int().min(1).max(1000),
  x: z.coerce.number().int().min(0).max(10000),
  y: z.coerce.number().int().min(0).max(10000),
  accord: z.literal('on'),
})
export async function preparerActe(_etat: EtatActe, form: FormData): Promise<EtatActe> {
  let cle: Buffer | undefined
  let reserve: string | undefined
  try {
    const config = configurationParcours()
    if (!config) return { message: signature.indisponible }
    const p = saisie.parse(Object.fromEntries(form))
    const fichier = form.get('pdf')
    if (!(fichier instanceof File) || fichier.size < 8 || fichier.size > 4 * 1024 * 1024)
      throw new Error()
    const utilisateur = await contexteAgence()
    if (utilisateur.etat !== 'rattache' || utilisateur.agence.statut !== 'verifiee')
      throw new Error()
    const { supabase } = utilisateur
    const [{ data: d, error: de }, { data: e, error: ee }] = await Promise.all([
      supabase
        .from('dossiers')
        .select('id,email_garant,statut,expire_le,demonstration')
        .eq('id', p.dossier)
        .maybeSingle(),
      supabase
        .from('engagements')
        .select('nom,prenom,mention,mention_saisie_le,version_conditions')
        .eq('dossier_id', p.dossier)
        .maybeSingle(),
    ])
    if (
      de ||
      ee ||
      !d ||
      !e ||
      !e.mention ||
      !e.mention_saisie_le ||
      d.statut !== 'transmis' ||
      d.demonstration
    )
      throw new Error()
    const pdf = Buffer.from(await fichier.arrayBuffer())
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error()
    const id = randomUUID()
    const contexte = contexteActe.parse({
      version: 1,
      id,
      dossier: p.dossier,
      prenom: e.prenom,
      nom: e.nom,
      email: d.email_garant,
      telephone: p.telephone,
      page: p.page,
      x: p.x,
      y: p.y,
    })
    cle = randomBytes(32)
    const expiration = echeanceActe(d.expire_le)
    const r = await supabase.rpc('preparer_acte_signature', {
      le_id: id,
      le_dossier: p.dossier,
      le_mode: config.mode,
      le_modele: config.modele,
      la_version: e.version_conditions,
      empreinte: empreintePdf(pdf),
      cle: bytea(scellerMaitresse(cle)),
      contexte: bytea(sceller(Buffer.from(JSON.stringify(contexte)), cle)),
      expiration: expiration.toISOString(),
      conservation: new Date(Date.now() + config.jours * 86400000).toISOString(),
    })
    if (r.error || r.data !== id) throw new Error()
    reserve = id
    const signal = AbortSignal.timeout(25000)
    await archiverFichier(await clientServeur(signal), id, 'projet', pdf, cle, signal)
    revalidatePath(`/espace/dossiers/${p.dossier}`)
    return { message: signature.succes, id }
  } catch {
    return { message: signature.erreur, id: reserve }
  } finally {
    cle?.fill(0)
  }
}
export async function validerActe(_etat: EtatActe, form: FormData): Promise<EtatActe> {
  try {
    if (!configurationParcours()) return { message: signature.indisponible }
    const id = z.uuid().parse(form.get('acte'))
    const decision = z.enum(['accepter', 'refuser']).parse(form.get('decision'))
    if (decision === 'accepter' && form.get('accord') !== 'on') throw new Error()
    const porteur = await capaciteDepuisCookies()
    if (
      !porteur ||
      porteur.capacite.partie !== 'garant' ||
      !formulaireDuDossier(form, porteur.capacite.dossierId)
    )
      throw new Error()
    const db = clientPorteurDeLien(porteur.jeton)
    const lecture = await db.rpc('lire_acte_signature', { le_id: id })
    if (lecture.error) throw new Error()
    const d = dossierActe.parse(lecture.data)
    if (d.acte.id !== id || form.get('empreinte') !== d.demande.empreinte_acte) throw new Error()
    const r = await db.rpc('valider_acte_signature', {
      le_id: id,
      empreinte: d.demande.empreinte_acte,
      accepter: decision === 'accepter',
    })
    if (r.error || r.data !== true) throw new Error()
    revalidatePath('/garant')
    revalidatePath(`/garant/actes/${id}`)
    return { message: decision === 'accepter' ? signature.valide : signature.refuse }
  } catch {
    return { message: signature.erreur }
  }
}

export async function reprendreDepotActe(_etat: EtatActe, form: FormData): Promise<EtatActe> {
  let cle: Buffer | undefined
  try {
    if (!configurationParcours()) throw new Error()
    const id = z.uuid().parse(form.get('acte'))
    const c = await contexteAgence()
    if (c.etat !== 'rattache' || c.agence.statut !== 'verifiee') throw new Error()
    const lecture = await c.supabase.rpc('lire_acte_signature', { le_id: id })
    if (lecture.error) throw new Error()
    const d = dossierActe.parse(lecture.data)
    if (d.acte.id !== id || d.acte.etape !== 'preparation') throw new Error()
    const fichier = form.get('pdf')
    if (!(fichier instanceof File) || fichier.size < 8 || fichier.size > 4 * 1024 * 1024)
      throw new Error()
    const pdf = Buffer.from(await fichier.arrayBuffer())
    if (empreintePdf(pdf) !== d.demande.empreinte_acte) throw new Error()
    cle = ouvrirContexteActe(d).cle
    const signal = AbortSignal.timeout(25000)
    await archiverFichier(await clientServeur(signal), id, 'projet', pdf, cle, signal)
    revalidatePath(`/espace/actes/${id}`)
    return { message: signature.succes, id }
  } catch {
    return { message: signature.erreur }
  } finally {
    cle?.fill(0)
  }
}
