import { lireStatuts } from '@/lib/connecteurs/lecture'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10
export async function GET(requete: Request) {
  return lireStatuts(requete)
}
