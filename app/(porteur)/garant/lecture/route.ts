import { lireRevenusDuGarant } from '@/lib/garant/lecture-revenus'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Proposition de revenu par lecture IA : rien n'est ecrit dans le dossier. */
export async function POST(requete: Request) {
  return lireRevenusDuGarant(requete)
}
