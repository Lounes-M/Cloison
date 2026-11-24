import { contexteAgence } from '@/lib/agences/contexte'
import {
  bloquesCSV,
  lireBloques,
  lireMois,
  lireSynthese,
  moisCSV,
  syntheseCSV,
} from '@/lib/agences/tableau-de-bord'
import { langueEspace } from '@/lib/langue-espace'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const prive = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
}
const vues = ['synthese', 'blocages', 'mois'] as const
type Vue = (typeof vues)[number]

function refus(status: number) {
  return new Response('Export indisponible.', { status, headers: prive })
}

/**
 * Le tableau de bord en CSV, pour tout membre rattache (0099).
 *
 * Chaque fonction SQL ne rend que l'agence de la session : aucun identifiant
 * d'agence ne vient de la requete. Une lecture en panne ou inattendue ne
 * produit aucun fichier, jamais un export partiel.
 */
export async function GET(req: Request, { params }: { params: Promise<{ vue: string }> }) {
  const { vue } = await params
  if (!(vues as readonly string[]).includes(vue)) return refus(404)
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(20000)])
  try {
    const c = await contexteAgence()
    if (c.etat !== 'rattache') return refus(403)
    const lire = async (fonction: string) => {
      const r = await c.supabase.rpc(fonction).abortSignal(signal)
      if (r.error) throw new Error('Lecture indisponible')
      return r.data as unknown
    }
    const langue = await langueEspace()
    let csv: string
    if ((vue as Vue) === 'blocages') {
      const dossiers = lireBloques(await lire('dossiers_bloques_de_mon_agence'))
      if (!dossiers) throw new Error('Lecture inattendue')
      csv = bloquesCSV(dossiers, langue)
    } else {
      const mois = lireMois(await lire('pilotage_mensuel_de_mon_agence'))
      if (!mois) throw new Error('Lecture inattendue')
      if ((vue as Vue) === 'mois') csv = moisCSV(mois, langue)
      else {
        const synthese = lireSynthese(await lire('pilotage_de_mon_agence'))
        if (!synthese) throw new Error('Lecture inattendue')
        csv = syntheseCSV(synthese, mois, langue)
      }
    }
    signal.throwIfAborted()
    return new Response(csv, {
      headers: {
        ...prive,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cloison-pilotage-${vue}.csv"`,
      },
    })
  } catch {
    return refus(503)
  }
}
