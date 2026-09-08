import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
export async function rapprocherPaiements(adresse, secret) {
  if (!secret) throw new Error('Authentification absente')
  const reponse = await fetch(adresse, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    redirect: 'error',
    signal: AbortSignal.timeout(40000),
  })
  if (reponse.status !== 200) throw new Error('Rapprochement incomplet')
  const resultat = await reponse.json()
  if (
    !resultat ||
    Object.keys(resultat).length !== 2 ||
    !Number.isSafeInteger(resultat.traites) ||
    resultat.traites < 0 ||
    resultat.traites > 2 ||
    resultat.echecs !== 0
  )
    throw new Error('Rapprochement non confirme')
  return { traites: resultat.traites, echecs: 0 }
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(
      JSON.stringify(
        await rapprocherPaiements(
          'https://www.cloison.immo/api/paiement/rapprochement',
          process.env.CRON_SECRET,
        ),
      ),
    )
  } catch {
    console.error('Rapprochement financier incomplet')
    process.exitCode = 1
  }
}
