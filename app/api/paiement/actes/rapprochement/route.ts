import { NextResponse } from 'next/server'
import { z } from 'zod'
import { secretCorrect } from '@/lib/exploitation/autorisation-cron'
import { clientServeur } from '@/lib/acces/serveur'
import { rapprocherSessionActe } from '@/lib/paiement/stripe'
export const runtime = 'nodejs'
export const maxDuration = 60
const headers = { 'Cache-Control': 'no-store' }
export async function POST(request: Request) {
  if (!secretCorrect(request.headers.get('authorization'), process.env.CRON_SECRET))
    return new NextResponse(null, { status: 401, headers })
  const actif = process.env.FACTURATION_ACTES_ENABLED === 'true'
  let traites = 0,
    echecs = 0
  if (actif)
    try {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45000)])
      const db = await clientServeur(signal)
      const r = await db.rpc('reglements_actes_a_rapprocher')
      if (r.error) throw new Error()
      const liste = z
        .array(
          z.object({ id: z.uuid(), session_ref: z.string().regex(/^cs_[A-Za-z0-9_]{1,190}$/) }),
        )
        .max(3)
        .parse(r.data)
      for (const ligne of liste) {
        try {
          request.signal.throwIfAborted()
          await rapprocherSessionActe(ligne.session_ref, ligne.id, signal)
          traites++
        } catch {
          echecs++
        }
      }
      const anomalies = await db.rpc('reglements_actes_a_examiner')
      if (anomalies.error || anomalies.data !== 0) echecs++
    } catch {
      echecs++
    }
  return NextResponse.json({ actif, traites, echecs }, { status: echecs ? 503 : 200, headers })
}
