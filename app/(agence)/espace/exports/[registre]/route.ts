import { contexteAgence } from '@/lib/agences/contexte'
import { exporterRegistre, RegistreTropGrand } from '@/lib/agences/exports-registres'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const prive = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
}
function refus(status: number) {
  return new Response('Export indisponible.', { status, headers: prive })
}
export async function GET(req: Request, { params }: { params: Promise<{ registre: string }> }) {
  const { registre } = await params
  if (registre !== 'archives' && registre !== 'reglements') return refus(404)
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(45000)])
  try {
    const c = await contexteAgence()
    if (c.etat !== 'rattache' || c.agence.statut !== 'verifiee') return refus(403)
    const csv = await exporterRegistre(
      registre,
      async (avant) => {
        const r = await c.supabase
          .rpc(registre === 'archives' ? 'archives_de_mon_agence' : 'factures_de_mon_agence', {
            avant,
          })
          .abortSignal(signal)
        if (r.error) throw new Error('Lecture indisponible')
        return r.data
      },
      signal,
    )
    // Revalider la session, la MFA et le rattachement après la collecte paginée.
    const actuel = await contexteAgence()
    if (
      actuel.etat !== 'rattache' ||
      actuel.agence.statut !== 'verifiee' ||
      actuel.agence.id !== c.agence.id ||
      actuel.utilisateurId !== c.utilisateurId
    )
      return refus(403)
    signal.throwIfAborted()
    return new Response(csv, {
      headers: {
        ...prive,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cloison-${registre}.csv"`,
      },
    })
  } catch (erreur) {
    return refus(erreur instanceof RegistreTropGrand ? 413 : 503)
  }
}
