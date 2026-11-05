import { activiteCSV } from '@/lib/agences/activite'
import { contexteAgence } from '@/lib/agences/contexte'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const prive = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
}

/** Les compteurs de la page d'activite, pour tout membre rattache (0068). */
export async function GET() {
  try {
    const c = await contexteAgence()
    if (c.etat !== 'rattache')
      return new Response('Export indisponible.', { status: 403, headers: prive })
    const { data, error } = await c.supabase.rpc('activite_de_mon_agence')
    if (error) throw new Error('Lecture indisponible')
    return new Response(activiteCSV(data), {
      headers: {
        ...prive,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="cloison-activite.csv"',
      },
    })
  } catch {
    return new Response('Export indisponible.', { status: 503, headers: prive })
  }
}
