import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function executerMaintenance(adresse, secret) {
  if (!secret) throw new Error('CRON_SECRET absent')
  let reponse
  try {
    reponse = await fetch(adresse, {
      headers: { Authorization: `Bearer ${secret}` },
      // Une redirection ne vaut pas execution et ne doit pas recevoir le secret.
      redirect: 'error',
      signal: AbortSignal.timeout(70_000),
    })
  } catch {
    throw new Error('Maintenance inaccessible ou redirigee')
  }
  if (reponse.status !== 200) throw new Error(`Maintenance : HTTP ${reponse.status}`)
  let resultat
  try {
    resultat = await reponse.json()
  } catch {
    throw new Error('Reponse de maintenance invalide')
  }
  for (const section of ['notifications', 'courriels', 'purge']) {
    if (resultat?.[section]?.echecs !== 0) throw new Error(`Maintenance incomplete : ${section}`)
  }
  for (const section of ['courriels', 'purge']) {
    if (!Number.isSafeInteger(resultat[section].traites) || resultat[section].traites < 0)
      throw new Error(`Compteur de maintenance invalide : ${section}`)
  }
  // N'imprimer que les compteurs attendus, jamais une reponse brute.
  return {
    notifications: { echecs: 0 },
    courriels: { traites: resultat.courriels.traites, echecs: 0 },
    purge: { traites: resultat.purge.traites, echecs: 0 },
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(
      JSON.stringify(
        await executerMaintenance(
          'https://www.cloison.immo/api/maintenance',
          process.env.CRON_SECRET,
        ),
      ),
    )
  } catch (erreur) {
    console.error(erreur instanceof Error ? erreur.message : 'Maintenance impossible')
    process.exitCode = 1
  }
}
