import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const ADRESSE = 'https://www.cloison.immo/api/maintenance/etat'
export function ageMaintenance(rapport, maintenant = Date.now()) {
  if (
    !rapport ||
    Object.keys(rapport).length !== 1 ||
    typeof rapport.derniere_reussite !== 'string'
  )
    throw new Error('Maintenance reussie absente')
  const termine = Date.parse(rapport.derniere_reussite),
    age = maintenant - termine
  if (!Number.isFinite(termine) || !Number.isFinite(maintenant) || age < -60000 || age > 45 * 60000)
    throw new Error('Maintenance absente ou en retard')
  return Math.max(0, Math.floor(age / 1000))
}
export async function verifierCadence(adresse, secret) {
  if (adresse !== ADRESSE || !secret) throw new Error('Configuration de supervision absente')
  const reponse = await fetch(adresse, {
    headers: { Authorization: `Bearer ${secret}` },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  })
  if (!reponse.ok) throw new Error('Historique de maintenance indisponible')
  return ageMaintenance(await reponse.json())
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const age = await verifierCadence(ADRESSE, process.env.CRON_SECRET)
    console.log(JSON.stringify({ maintenance_age_secondes: age }))
  } catch {
    console.error('Maintenance non confirmee dans les 45 dernieres minutes')
    process.exitCode = 1
  }
}
