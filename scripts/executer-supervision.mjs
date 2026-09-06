import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lireRapportSupervision, contientAlertes } from '../lib/exploitation/supervision.mjs'
export async function executerSupervision(adresse, secret) {
  if (!secret) throw new Error('CRON_SECRET absent')
  let reponse
  try {
    reponse = await fetch(adresse, {
      headers: { Authorization: `Bearer ${secret}` },
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new Error('Supervision inaccessible ou redirigee')
  }
  if (reponse.status !== 200) throw new Error(`Supervision : HTTP ${reponse.status}`)
  let rapport
  try {
    rapport = await reponse.json()
  } catch {
    throw new Error('Rapport de supervision invalide')
  }
  return lireRapportSupervision(rapport)
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const rapport = await executerSupervision(
      'https://www.cloison.immo/api/supervision',
      process.env.CRON_SECRET,
    )
    console.log(JSON.stringify(rapport))
    if (contientAlertes(rapport)) {
      console.error('Supervision : activite ou file a examiner')
      process.exitCode = 1
    }
  } catch {
    console.error('Supervision indisponible ou rapport invalide')
    process.exitCode = 1
  }
}
