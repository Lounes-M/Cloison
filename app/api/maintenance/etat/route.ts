import { NextResponse } from 'next/server'
import { clientServeur } from '@/lib/acces/serveur'
import { secretCorrect } from '@/lib/exploitation/autorisation-cron'
export const runtime = 'nodejs'
export async function GET(requete: Request) {
  if (!secretCorrect(requete.headers.get('authorization'), process.env.CRON_SECRET))
    return new NextResponse(null, { status: 401 })
  try {
    const { data, error } = await (
      await clientServeur(AbortSignal.timeout(5000))
    ).rpc('etat_maintenance')
    if (error || !data || !Object.hasOwn(data, 'derniere_reussite'))
      throw new Error('Etat indisponible')
    return NextResponse.json(
      { derniere_reussite: data.derniere_reussite },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      { disponible: false },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
