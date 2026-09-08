import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

export function ageMaintenance(rapport, maintenant = Date.now()) {
  const execution = rapport?.workflow_runs?.[0]
  if (!execution || execution.status !== 'completed' || execution.conclusion !== 'success')
    throw new Error('Maintenance reussie absente')
  const debut = Date.parse(execution.run_started_at)
  const age = maintenant - debut
  if (!Number.isFinite(debut) || !Number.isFinite(maintenant) || age < -60_000 || age > 45 * 60_000)
    throw new Error('Maintenance absente ou en retard')
  return Math.max(0, Math.floor(age / 1000))
}

export async function verifierCadence(depot, jeton) {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(depot ?? '') || !jeton)
    throw new Error('Configuration de supervision absente')
  const reponse = await fetch(
    `https://api.github.com/repos/${depot}/actions/workflows/maintenance.yml/runs?status=success&per_page=1`,
    {
      headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/vnd.github+json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    },
  )
  if (!reponse.ok) throw new Error('Historique de maintenance indisponible')
  return ageMaintenance(await reponse.json())
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const age = await verifierCadence(process.env.GITHUB_REPOSITORY, process.env.GITHUB_TOKEN)
    console.log(JSON.stringify({ maintenance_age_secondes: age }))
  } catch {
    console.error('Maintenance non confirmee dans les 45 dernieres minutes')
    process.exitCode = 1
  }
}
