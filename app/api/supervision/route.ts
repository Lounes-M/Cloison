import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { clientServeur } from '@/lib/acces/serveur'
import { lireRapportSupervision } from '@/lib/exploitation/supervision.mjs'
export const runtime = 'nodejs'
export async function GET(requete: Request) {
  const secret = process.env.CRON_SECRET
  const recu = Buffer.from(requete.headers.get('authorization') ?? '')
  const attendu = Buffer.from(`Bearer ${secret ?? ''}`)
  if (!secret || recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) {
    return new NextResponse(null, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  try {
    const db = await clientServeur()
    const { data, error } = await db.rpc('rapport_exploitation')
    if (error) throw new Error('Lecture indisponible')
    return NextResponse.json(lireRapportSupervision(data), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    console.error('[supervision] rapport indisponible')
    return NextResponse.json(
      { disponible: false },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
