import { secretCorrect } from '@/lib/exploitation/autorisation-cron'
import { NextResponse } from 'next/server'
import { clientServeur } from '@/lib/acces/serveur'
import { livrerNotifications } from '@/lib/courriels/notifications'
import { preparerRappels } from '@/lib/courriels/rappels'
import { annoncerFinsDeDossier } from '@/lib/courriels/fin-dossier'
import { alerterDelaisAgence } from '@/lib/courriels/delais-agence'
import { livrerLiens } from '@/lib/courriels/livraison-liens'
import { distribuerCourriels } from '@/lib/courriels/file'
import { purgerCoffres } from '@/lib/exploitation/purge'
import { veillerPlanificateurs } from '@/lib/exploitation/veille-planificateurs'

export const runtime = 'nodejs'
export const maxDuration = 60
const headers = { 'Cache-Control': 'no-store' }
export async function GET(request: Request) {
  const recu = request.headers.get('authorization')
  // Le jeton dit qui lance : pg_cron a le sien, GitHub et Vercel partagent l'autre.
  const parSupabase = secretCorrect(recu, process.env.CRON_SUPABASE_SECRET)
  if (!parSupabase && !secretCorrect(recu, process.env.CRON_SECRET)) {
    return new NextResponse(null, { status: 401, headers })
  }
  let db: Awaited<ReturnType<typeof clientServeur>>
  const budgetPurge = AbortSignal.timeout(15_000)
  try {
    db = await clientServeur(budgetPurge)
  } catch {
    console.error('[maintenance] connexion indisponible')
    return NextResponse.json(
      {
        notifications: { echecs: 1 },
        courriels: { traites: 0, echecs: 1 },
        purge: { traites: 0, echecs: 1 },
      },
      { status: 503, headers },
    )
  }

  // La veille des planificateurs lit la reussite precedente avant que ce passage
  // la remplace. Elle court pendant la purge, sur son propre budget de quatre
  // secondes, et n'ajoute donc rien a la duree maximale de la route.
  const veille = veillerPlanificateurs(parSupabase ? 'supabase' : 'github-ou-vercel')
    .then((bilan) => compteur(bilan.echecs))
    .catch(() => {
      console.error('[maintenance] veille des planificateurs indisponible')
      return 1
    })
  // La retention passe avant les envois. Chaque phase rend son propre bilan :
  // une panne de courriel ne doit jamais empecher la destruction des donnees.
  const purge = await executerLot('purge', () => purgerCoffres(db, budgetPurge))
  let notifications = { echecs: 1 }
  let echecsLiens = 1
  try {
    const budget = AbortSignal.timeout(5_000)
    echecsLiens = compteur(
      (await livrerLiens(await clientServeur(budget), undefined, budget)).echecs,
    )
  } catch {
    console.error('[maintenance] liens indisponibles')
  }
  try {
    const budget = AbortSignal.timeout(10_000)
    notifications = {
      echecs: compteur(
        (await livrerNotifications(await clientServeur(budget), undefined, budget)).echecs,
      ),
    }
  } catch {
    console.error('[maintenance] notifications indisponibles')
  }
  notifications.echecs += echecsLiens
  // Les rappels, les annonces de fin de dossier et les alertes de delai partagent un budget : la
  // somme des budgets de la route doit rester sous sa duree maximale.
  const budgetRappels = AbortSignal.timeout(6_000)
  try {
    notifications.echecs += compteur(
      (await preparerRappels(await clientServeur(budgetRappels), budgetRappels)).echecs,
    )
  } catch {
    console.error('[maintenance] rappels indisponibles')
    notifications.echecs++
  }
  try {
    notifications.echecs += compteur(
      (await annoncerFinsDeDossier(await clientServeur(budgetRappels), budgetRappels)).echecs,
    )
  } catch {
    console.error('[maintenance] annonces de fin de dossier indisponibles')
    notifications.echecs++
  }
  // L'alerte sur les 48 heures promises aux agences (0093) : meme budget.
  try {
    notifications.echecs += compteur(
      (await alerterDelaisAgence(await clientServeur(budgetRappels), budgetRappels)).echecs,
    )
  } catch {
    console.error('[maintenance] alertes de delai indisponibles')
    notifications.echecs++
  }
  // Ses alertes sont en file : elles partent avec les courriels de ce passage.
  notifications.echecs += await veille
  const courriels = await executerLot('courriels', async () => {
    const budget = AbortSignal.timeout(18_000)
    return distribuerCourriels(await clientServeur(budget), undefined, budget)
  })
  if (!notifications.echecs && !courriels.echecs && !purge.echecs) {
    try {
      const confirmation = await clientServeur(AbortSignal.timeout(3_000))
      const { data, error } = await confirmation.rpc('confirmer_maintenance')
      if (error || data !== true) throw new Error('Confirmation refusee')
    } catch {
      console.error('[maintenance] confirmation indisponible')
      notifications.echecs++
    }
  }
  return NextResponse.json(
    { notifications, courriels, purge },
    { status: notifications.echecs || courriels.echecs || purge.echecs ? 503 : 200, headers },
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
