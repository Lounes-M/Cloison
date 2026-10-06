import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lireJsonBorne } from './lire-json-borne.mjs'
export async function verifierCadenceActes(secret, origine = 'https://www.cloison.immo') {
  if (!secret) throw new Error('Authentification absente')
  const signal = AbortSignal.timeout(20000)
  const r = await fetch(origine + '/api/actes/etat', {
    headers: { Authorization: `Bearer ${secret}` },
    redirect: 'error',
    signal,
  })
  if (r.status !== 200) {
    void r.body?.cancel().catch(() => {})
    throw new Error('Cadence des actes non confirmee')
  }
  const bilan = await lireJsonBorne(r, signal)
  if (!bilan || Array.isArray(bilan) || Object.keys(bilan).length !== 1 || bilan.conforme !== true)
    throw new Error('Cadence des actes non confirmee')
  return { conforme: true }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(await verifierCadenceActes(process.env.CRON_SECRET)))
  } catch {
    console.error('Cadence des actes non confirmee')
    process.exitCode = 1
  }
}
