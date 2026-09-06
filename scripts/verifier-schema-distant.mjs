import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
export async function verifierSchemaDistant(adresse, secret) {
  if (!secret) throw new Error('Secret absent')
  const r = await fetch(adresse, {
    headers: { Authorization: `Bearer ${secret}` },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  if (r.status !== 200) throw new Error('Controle schema refuse')
  const data = await r.json()
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Object.keys(data).length !== 1 ||
    data.conforme !== true
  )
    throw new Error('Controle schema invalide')
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await verifierSchemaDistant('https://www.cloison.immo/api/schema', process.env.CRON_SECRET)
    console.log('Schema de production conforme a la reference approuvee')
  } catch {
    console.error('Schema de production indisponible ou non conforme')
    process.exitCode = 1
  }
}
