import { lireJsonBorne } from './lire-json-borne.mjs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
export async function traiterActes(secret, origine = 'https://www.cloison.immo') {
  if (!secret) throw new Error('Authentification absente')
  for (const chemin of [
    '/api/signature/rapprochement',
    '/api/signature/traitement',
    '/api/paiement/actes/rapprochement',
  ]) {
    const signal = AbortSignal.timeout(60000)
    const reponse = await fetch(origine + chemin, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      redirect: 'error',
      signal,
    })
    if (reponse.status !== 200) throw new Error('Traitement incomplet')
    const r = await lireJsonBorne(reponse, signal)
    if (
      !r ||
      typeof r.actif !== 'boolean' ||
      !Number.isSafeInteger(r.traites) ||
      r.traites < 0 ||
      r.traites > 3 ||
      r.echecs !== 0 ||
      (!r.actif && r.traites !== 0) ||
      (chemin.endsWith('/traitement') &&
        (!Number.isSafeInteger(r.effaces) || r.effaces < 0 || r.effaces > 10))
    )
      throw new Error('Traitement non confirme')
  }
  return { confirme: true }
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(await traiterActes(process.env.CRON_SECRET)))
  } catch {
    console.error('Traitement des actes incomplet')
    process.exitCode = 1
  }
}
