import { lireJsonBorne } from './lire-json-borne.mjs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
export async function rapprocherSignatures(adresse, secret) {
  const signal = AbortSignal.timeout(60000)
  if (!secret) throw new Error('Authentification absente')
  const reponse = await fetch(adresse, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    redirect: 'error',
    signal,
  })
  if (reponse.status !== 200) throw new Error('Rapprochement incomplet')
  const resultat = await lireJsonBorne(reponse, signal)
  if (
    !resultat ||
    Object.keys(resultat).length !== 3 ||
    typeof resultat.actif !== 'boolean' ||
    (!resultat.actif && resultat.traites !== 0) ||
    !Number.isSafeInteger(resultat.traites) ||
    resultat.traites < 0 ||
    resultat.traites > 2 ||
    resultat.echecs !== 0
  )
    throw new Error('Rapprochement non confirme')
  return { actif: resultat.actif, traites: resultat.traites, echecs: 0 }
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(
      JSON.stringify(
        await rapprocherSignatures(
          'https://www.cloison.immo/api/signature/rapprochement',
          process.env.CRON_SECRET,
        ),
      ),
    )
  } catch {
    console.error('Rapprochement des signatures incomplet')
    process.exitCode = 1
  }
}
