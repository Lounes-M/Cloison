import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { clientServeur } from '@/lib/acces/serveur'
import { schemaConforme } from '@/lib/exploitation/schema'
import reference from '@/lib/exploitation/schema-production.json'
export const runtime = 'nodejs'
export async function GET(requete: Request) {
  const secret = process.env.CRON_SECRET
  const recu = Buffer.from(requete.headers.get('authorization') ?? '')
  const attendu = Buffer.from(`Bearer ${secret ?? ''}`)
  if (!secret || recu.length !== attendu.length || !timingSafeEqual(recu, attendu))
    return new NextResponse(null, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  try {
    const db = await clientServeur()
    const { data, error } = await db.rpc('empreinte_schema')
    if (error || !schemaConforme(data, reference)) throw new Error('Schema non conforme')
    return NextResponse.json({ conforme: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    console.error('[schema] controle indisponible ou derive detectee')
    return NextResponse.json(
      { conforme: false },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
