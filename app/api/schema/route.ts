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
    const db = await clientServeur(AbortSignal.timeout(10_000))
    const { data, error } = await db.rpc('empreinte_schema')
    if (error || !schemaConforme(data, reference)) throw new Error('Schema non conforme')
    // Ne lire aucun entete : une requete vide suffit a verifier la frontiere API.
    const reseau = await db.schema('net').from('http_request_queue').select('id').limit(0)
    if (reseau.error?.code !== 'PGRST106' || reseau.data !== null)
      throw new Error('Schema reseau expose ou controle indisponible')
    return NextResponse.json({ conforme: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    console.error('[schema] controle indisponible ou derive detectee')
    return NextResponse.json(
      { conforme: false },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
