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
  let db: Awaited<ReturnType<typeof clientServeur>>
  try {
    db = await clientServeur()
  } catch {
    console.error('[maintenance] connexion indisponible')
    return NextResponse.json(
      {
        notifications: { echecs: 1 },
        courriels: { traites: 0, echecs: 1 },
        purge: { traites: 0, echecs: 1 },
      },
      { status: 503 },
    )
  }

  // La retention passe avant les envois. Chaque phase rend son propre bilan :
  // une panne de courriel ne doit jamais empecher la destruction des donnees.
  const purge = await executerLot('purge', () => purgerCoffres(db))
  let notifications = { echecs: 1 }
  try {
    notifications = { echecs: compteur((await livrerNotifications(db)).echecs) }
  } catch {
    console.error('[maintenance] notifications indisponibles')
  }
  const courriels = await executerLot('courriels', () => distribuerCourriels(db))
  return NextResponse.json(
    { notifications, courriels, purge },
    { status: notifications.echecs || courriels.echecs || purge.echecs ? 503 : 200 },
  )
}

function compteur(valeur: number): number {
  if (!Number.isSafeInteger(valeur) || valeur < 0) throw new Error('Compteur invalide')
  return valeur
}

async function executerLot(
  phase: 'purge' | 'courriels',
  executer: () => Promise<{ traites: number; echecs: number }>,
) {
  try {
    const bilan = await executer()
    return { traites: compteur(bilan.traites), echecs: compteur(bilan.echecs) }
  } catch {
    // Le nom vient de cette route, jamais d'une reponse de service.
    console.error(
      phase === 'purge'
        ? '[maintenance] purge indisponible'
        : '[maintenance] courriels indisponibles',
    )
    return { traites: 0, echecs: 1 }
  }
}
