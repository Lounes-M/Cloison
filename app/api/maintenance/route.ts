import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { clientServeur } from '@/lib/acces/serveur'
import { livrerNotifications } from '@/lib/courriels/notifications'
import { distribuerCourriels } from '@/lib/courriels/file'
import { purgerCoffres } from '@/lib/exploitation/purge'

export const runtime = 'nodejs'
export const maxDuration = 60
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const recu = Buffer.from(request.headers.get('authorization') ?? '')
  const attendu = Buffer.from(`Bearer ${secret ?? ''}`)
  if (!secret || recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) {
    return new NextResponse(null, { status: 401 })
  }
  try {
    const db = await clientServeur()
    const notifications = await livrerNotifications(db)
    const courriels = await distribuerCourriels(db)
    const purge = await purgerCoffres(db)
    return NextResponse.json(
      { notifications, courriels, purge },
      { status: notifications.echecs || courriels.echecs || purge.echecs ? 503 : 200 },
    )
  } catch {
    console.error('[maintenance] purge impossible')
    return NextResponse.json({ erreur: true }, { status: 503 })
  }
}
