import { NextResponse } from 'next/server'
import { clientServeur } from '@/lib/acces/serveur'
import { retourApimoActif } from '@/lib/connecteurs/apimo/configuration'
import { rendreEtatsApimo } from '@/lib/connecteurs/apimo/retours'
import { secretCorrect } from '@/lib/exploitation/autorisation-cron'

export const runtime = 'nodejs'
export const maxDuration = 60
const headers = { 'Cache-Control': 'no-store' }

/**
 * Cycle des retours d'etat vers Apimo, declenche par le cron. Ferme tant que
 * `CONNECTEUR_APIMO` et `APIMO_RETOUR_STATUT` ne sont pas poses : il repond
 * alors sans rien lire ni appeler.
 */
export async function GET(request: Request) {
  const recu = request.headers.get('authorization')
  if (
    !secretCorrect(recu, process.env.CRON_SECRET) &&
    !secretCorrect(recu, process.env.CRON_SUPABASE_SECRET)
  )
    return new NextResponse(null, { status: 401, headers })
  if (!retourApimoActif()) return NextResponse.json({ actif: false }, { headers })
  try {
    const budget = AbortSignal.timeout(45_000)
    const bilan = await rendreEtatsApimo(await clientServeur(budget), budget)
    // Un refus d'Apimo pour une agence n'est pas une panne du cycle : il se
    // lit dans le bilan et se retente selon la base.
    return NextResponse.json({ actif: true, ...bilan }, { headers })
  } catch {
    console.error('[apimo] cycle des retours indisponible')
    return NextResponse.json({ actif: true, traites: 0, echecs: 1 }, { status: 503, headers })
  }
}
