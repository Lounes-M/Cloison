import { lireJsonBorne } from './lire-json-borne.mjs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
export async function traiterActes(secret, origine = 'https://www.cloison.immo') {
  if (!secret) throw new Error('Authentification absente')
  let echecs = 0
  for (const [chemin, maximum] of [
    ['/api/signature/rapprochement', 2],
    ['/api/signature/traitement', 1],
    ['/api/paiement/actes/rapprochement', 3],
  ]) {
    try {
      const signal = AbortSignal.timeout(60000)
      const reponse = await fetch(origine + chemin, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
        redirect: 'error',
        signal,
      })
      if (reponse.status !== 200) {
        void reponse.body?.cancel().catch(() => {})
        throw new Error('Traitement incomplet')
      }
      const r = await lireJsonBorne(reponse, signal)
      if (
        !r ||
        Array.isArray(r) ||
        typeof r.actif !== 'boolean' ||
        !Number.isSafeInteger(r.traites) ||
        r.traites < 0 ||
        r.traites > maximum ||
        r.echecs !== 0 ||
        (!r.actif && r.traites !== 0) ||
        (chemin.endsWith('/traitement') &&
          (!Number.isSafeInteger(r.effaces) || r.effaces < 0 || r.effaces > 10))
      )
        throw new Error('Traitement non confirme')
    } catch {
      // Un fournisseur indisponible ne suspend ni la retention ni les autres rapprochements.
      echecs++
    }
  }
  if (echecs) throw new Error('Traitement des actes incomplet')
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
