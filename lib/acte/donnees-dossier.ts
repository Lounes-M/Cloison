import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { donneesActe, type DonneesActe } from './modele-cautionnement'

/**
 * Ce que le dossier ne sait pas, et que l'agence complete au moment de
 * preparer l'acte : le bail lui-meme (bailleur, logement, loyer hors charges,
 * revision) et l'etat civil de la caution, que l'agence lit sur sa piece
 * d'identite. Rien de tout cela n'est enregistre en base : ces valeurs vivent
 * dans le PDF, dont l'empreinte est scellee avec l'acte.
 */
const montant = z
  .string()
  .trim()
  .regex(/^\d{1,9}(?:[,.]\d{1,2})?$/)
  .transform((v) => {
    const [e, c = ''] = v.split(/[,.]/)
    return Number(e) * 100 + Number(c.padEnd(2, '0'))
  })

export const complementActe = z.object({
  civilite: z.enum(['madame', 'monsieur']),
  naissance_le: z.iso.date(),
  naissance_lieu: z.string().trim().min(2).max(160),
  locataire: z.string().trim().min(2).max(240),
  bailleur_nom: z.string().trim().min(2).max(240),
  bailleur_adresse: z.string().trim().min(5).max(400),
  logement: z.string().trim().min(5).max(400),
  loyer: montant.refine((v) => v > 0),
  charges: z.union([z.literal('').transform(() => null), montant]),
  periodicite: z.enum(['mois', 'trimestre', 'an']),
  revision_le: z.iso.date(),
  irl_trimestre: z.coerce.number().int().min(1).max(4),
  irl_annee: z.coerce.number().int().min(2000).max(2100),
  co_cautions: z
    .string()
    .trim()
    .max(800)
    .transform((v) =>
      v
        .split(/[\n;]/)
        .map((n) => n.trim())
        .filter(Boolean),
    ),
  fait_lieu: z.string().trim().min(2).max(120),
  fait_le: z.iso.date(),
})

export type LectureModele =
  { ok: true; donnees: DonneesActe } | { ok: false; motif: 'saisie' | 'dossier' | 'mention' }

/**
 * Les donnees de l'acte d'un dossier transmis, lues avec les droits de
 * l'agence connectee. Un seul garant par dossier aujourd'hui ; avec plusieurs,
 * on lira l'engagement de la caution choisie, et le reste ne change pas.
 */
export async function donneesDepuisDossier(
  supabase: SupabaseClient,
  dossier: string,
  form: FormData,
  agence: string,
): Promise<LectureModele> {
  const saisie = complementActe.safeParse(
    Object.fromEntries(Object.keys(complementActe.shape).map((k) => [k, form.get(k) ?? ''])),
  )
  if (!saisie.success) return { ok: false, motif: 'saisie' }
  const s = saisie.data

  const [{ data: d, error: de }, { data: e, error: ee }] = await Promise.all([
    supabase
      .from('dossiers')
      .select('id,statut,expire_le,demonstration')
      .eq('id', dossier)
      .maybeSingle(),
    supabase
      .from('engagements')
      .select(
        'nom,prenom,adresse,mention,mention_saisie_le,solidaire,couvre,montant_max_cents,jusqu_au',
      )
      .eq('dossier_id', dossier)
      .maybeSingle(),
  ])
  if (
    de ||
    ee ||
    !d ||
    d.id !== dossier ||
    d.statut !== 'transmis' ||
    d.demonstration ||
    !(Date.parse(d.expire_le) > Date.now()) ||
    !e
  )
    return { ok: false, motif: 'dossier' }
  if (
    !e.mention ||
    !e.mention_saisie_le ||
    !e.nom ||
    !e.prenom ||
    !e.adresse ||
    !e.montant_max_cents
  )
    return { ok: false, motif: 'mention' }

  const donnees = donneesActe.safeParse({
    caution: {
      civilite: s.civilite,
      prenom: e.prenom,
      nom: e.nom,
      naissanceLe: s.naissance_le,
      naissanceLieu: s.naissance_lieu,
      adresse: e.adresse,
    },
    locataire: s.locataire,
    coCautions: s.co_cautions,
    bailleur: { nom: s.bailleur_nom, adresse: s.bailleur_adresse },
    mandataire: agence,
    logement: s.logement,
    loyer: {
      horsChargesCents: s.loyer,
      chargesCents: s.charges,
      periodicite: s.periodicite,
      revisionLe: s.revision_le,
      irlTrimestre: s.irl_trimestre,
      irlAnnee: s.irl_annee,
    },
    engagement: {
      solidaire: e.solidaire,
      couvre: e.couvre,
      plafondCents: Number(e.montant_max_cents),
      jusquAu: e.jusqu_au,
    },
    mention: {
      texte: e.mention,
      saisieLe: new Date(e.mention_saisie_le).toISOString(),
    },
    fait: { lieu: s.fait_lieu, le: s.fait_le },
  })
  return donnees.success
    ? { ok: true, donnees: donnees.data as DonneesActe }
    : { ok: false, motif: 'saisie' }
}
