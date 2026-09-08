import { NextResponse } from 'next/server'
import { clientServeur } from '@/lib/acces/serveur'
import { secretCorrect } from '@/lib/exploitation/autorisation-cron'
import { lireSessionPourRapprochement } from '@/lib/paiement/stripe'
export const runtime = 'nodejs'
export const maxDuration = 35
export async function POST(requete: Request) {
  const headers = { 'Cache-Control': 'no-store' }
  if (!secretCorrect(requete.headers.get('authorization'), process.env.CRON_SECRET))
    return new NextResponse(null, { status: 401, headers })
  let traites = 0,
    echecs = 0
  try {
    const signal = AbortSignal.any([requete.signal, AbortSignal.timeout(25000)])
    const db = await clientServeur(signal)
    const { data, error } = await db.rpc('paiements_a_rapprocher')
    if (
      error ||
      !Array.isArray(data) ||
      data.length > 2 ||
      data.some(
        (r) =>
          typeof r.reference_session !== 'string' ||
          !/^cs_[A-Za-z0-9_]{1,190}$/.test(r.reference_session),
      )
    )
      throw new Error('File financiere indisponible')
    for (const ligne of data) {
      signal.throwIfAborted()
      try {
        const reservation = await db.rpc('reserver_rapprochement', {
          la_reference: ligne.reference_session,
        })
        if (reservation.error || typeof reservation.data !== 'boolean')
          throw new Error('Reservation non confirmee')
        if (!reservation.data) continue
        const session = await lireSessionPourRapprochement(ligne.reference_session)
        signal.throwIfAborted()
        const resultat = await db.rpc('rapprocher_paiement', session)
        if (resultat.error || resultat.data !== true) throw new Error('Rapprochement non confirme')
        traites++
      } catch {
        echecs++
      }
    }
  } catch {
    echecs++
  }
  if (echecs) console.error('[paiement] rapprochement a reprendre')
  return NextResponse.json({ traites, echecs }, { status: echecs ? 503 : 200, headers })
}
