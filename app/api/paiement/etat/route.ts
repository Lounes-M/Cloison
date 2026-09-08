import { NextResponse } from 'next/server'
import { clientServeur } from '@/lib/acces/serveur'
import { secretCorrect } from '@/lib/exploitation/autorisation-cron'
import { lireEtatPaiements } from '@/lib/exploitation/paiements.mjs'
export const runtime = 'nodejs'
export const maxDuration = 10
export async function GET(requete: Request) {
  const headers = { 'Cache-Control': 'no-store' }
  if (!secretCorrect(requete.headers.get('authorization'), process.env.CRON_SECRET))
    return new NextResponse(null, { status: 401, headers })
  try {
    const db = await clientServeur(AbortSignal.any([requete.signal, AbortSignal.timeout(5000)]))
    const { data, error } = await db.rpc('etat_paiements')
    if (error) throw new Error('Lecture indisponible')
    return NextResponse.json(lireEtatPaiements(data), { headers })
  } catch {
    console.error('[paiement] etat indisponible')
    return NextResponse.json({ disponible: false }, { status: 503, headers })
  }
}
