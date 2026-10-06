import { NextResponse } from 'next/server'
import { clientServeur } from '@/lib/acces/serveur'
import { secretCorrect } from '@/lib/exploitation/autorisation-cron'
import { lireCadenceActes } from '@/lib/exploitation/cadence-actes.mjs'
export const runtime = 'nodejs'
export const maxDuration = 15
const headers = { 'Cache-Control': 'no-store' }
export async function GET(requete: Request) {
  if (!secretCorrect(requete.headers.get('authorization'), process.env.CRON_SECRET))
    return new NextResponse(null, { status: 401, headers })
  try {
    const db = await clientServeur(AbortSignal.any([requete.signal, AbortSignal.timeout(10000)]))
    const r = await db.rpc('etat_traitements_actes')
    if (r.error) throw new Error()
    const etat = lireCadenceActes(r.data)
    return NextResponse.json(etat, { status: etat.conforme ? 200 : 503, headers })
  } catch {
    return NextResponse.json({ conforme: false }, { status: 503, headers })
  }
}
