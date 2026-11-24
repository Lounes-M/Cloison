import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import {
  echeanceOuvree,
  joursFeriesDecomptes,
  type JourFerie,
} from '@/lib/exploitation/jours-feries.mjs'
import { envoyer } from './envoi'

/**
 * L'alerte sur les 48 heures ouvrées promises aux agences (migration 0093).
 *
 * Le site promet une réponse sous 48 heures ouvrées à une demande de
 * démonstration et à une demande d'activation. Ce courriel interne te prévient
 * deux fois par demande restée sans réponse : quand il reste un jour ouvré,
 * puis quand le délai est dépassé. Il porte la ligne SQL qui marque la
 * réponse, parce que c'est ce geste qui éteint l'alerte.
 *
 * La clé de mise en file est stable par demande et par palier, donc un passage
 * interrompu se rejoue sans doublon ; l'alerte n'est acquittée qu'une fois le
 * courriel en file.
 *
 * Les jours fériés ne comptent pas. La base ne les connaît pas : sa fonction
 * `echeance_ouvree` saute seulement le week-end, donc elle rend une demande
 * au plus tôt, jamais trop tard. Chaque ligne est recomptée ici avec le
 * calendrier de `lib/exploitation/jours-feries.mjs` :
 *   - pas encore due une fois les jours fériés retirés : la ligne est
 *     laissée, sans courriel ni acquittement, et revient au passage suivant ;
 *   - due à un palier moins avancé que celui de la base : c'est ce palier qui
 *     part. La base la représente tant que « dépassé » n'est pas acquitté ;
 *     la clé stable rend ces rejeux sans effet.
 * Le siège est à Paris : le calendrier est celui de la métropole.
 */
const alerte = z.object({
  nature: z.enum(['demande', 'activation']),
  objet: z.uuid(),
  depuis: z.iso.datetime({ offset: true }),
  palier: z.enum(['proche', 'depasse']),
  nom: z.string().min(1).max(200),
  contact: z.string().min(1).max(180),
  echeance: z.iso.datetime({ offset: true }),
})
type Alerte = z.infer<typeof alerte> & { feries: JourFerie[] }

/** La ligne recomptée sans les jours fériés, ou `null` si rien n'est encore dû. */
function selonCalendrier(ligne: z.infer<typeof alerte>, maintenant: Date): Alerte | null {
  const echeance = echeanceOuvree(ligne.depuis, 2)
  const palier =
    echeance <= maintenant
      ? ('depasse' as const)
      : echeanceOuvree(ligne.depuis, 1) <= maintenant
        ? ('proche' as const)
        : null
  if (!palier) return null
  return {
    ...ligne,
    palier,
    echeance: echeance.toISOString(),
    feries: joursFeriesDecomptes(ligne.depuis, echeance),
  }
}

export async function alerterDelaisAgence(
  db: SupabaseClient,
  signal?: AbortSignal,
  maintenant: Date = new Date(),
) {
  const { data, error } = await db.rpc('delais_agence_a_alerter')
  const resultat = z.array(alerte).max(20).safeParse(data)
  if (error || !resultat.success) throw new Error('Alertes de délai indisponibles')
  let echecs = 0
  let reportees = 0
  for (const ligne of resultat.data) {
    signal?.throwIfAborted()
    const a = selonCalendrier(ligne, maintenant)
    if (!a) {
      reportees++
      continue
    }
    const hex = createHash('sha256')
      .update(`delai:${a.nature}:${a.objet}:${a.depuis}:${a.palier}`)
      .digest('hex')
      .slice(0, 32)
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    if (
      !(await envoyer(env.emailDestinataire, sujet(a), corps(a), id, undefined, true, {
        db,
        signal,
      }))
    ) {
      echecs++
      continue
    }
    const { data: acquitte, error: refus } = await db.rpc('acquitter_alerte_delai', {
      la_nature: a.nature,
      l_objet: a.objet,
      le_depart: a.depuis,
      le_palier: a.palier,
    })
    // `false` : la demande a reçu sa réponse entre-temps, ou l'activation a été redemandée.
    if (refus || typeof acquitte !== 'boolean') echecs++
  }
  return { echecs, reportees }
}

function sujet(a: Alerte) {
  const quoi = a.nature === 'demande' ? 'Demande de démonstration' : 'Demande d’activation'
  return a.palier === 'depasse'
    ? `48 h dépassées : ${quoi}, ${a.nom}`
    : `48 h, il reste un jour ouvré : ${quoi}, ${a.nom}`
}

function corps(a: Alerte) {
  const date = (instant: string) =>
    new Date(instant).toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      dateStyle: 'full',
      timeStyle: 'short',
    })
  const jour = (j: string) =>
    new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', {
      timeZone: 'UTC',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  const marquer =
    a.nature === 'demande'
      ? [
          'Une fois la réponse partie, dans l’éditeur SQL Supabase :',
          '',
          `  update public.demandes_agence set statut = 'contactee'`,
          `   where id = '${a.objet}';`,
        ]
      : [
          'Pour activer, dans l’éditeur SQL Supabase :',
          '',
          `  update public.agences set statut = 'verifiee', verifiee_le = now()`,
          `   where id = '${a.objet}';`,
          '',
          'Pour refuser, après avoir répondu à l’agence :',
          '',
          `  update public.agences set activation_demandee_le = null`,
          `   where id = '${a.objet}';`,
        ]
  return [
    a.palier === 'depasse'
      ? 'Le site promet une réponse sous 48 heures ouvrées. Ce délai est dépassé et la demande est toujours sans réponse.'
      : 'Le site promet une réponse sous 48 heures ouvrées. Il reste un jour ouvré pour répondre à cette demande.',
    '',
    `Agence   : ${a.nom}`,
    `${a.nature === 'demande' ? 'E-mail   ' : 'Domaine  '}: ${a.contact}`,
    `Reçue    : ${date(a.depuis)}`,
    `Échéance : ${date(a.echeance)}`,
    ...a.feries.map((f) => `Férié    : ${jour(f.jour)} (${f.nom}), non compté`),
    '',
    ...marquer,
    '',
    'Cloison',
  ].join('\n')
}
