import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lireEtatPaiements, paiementsAExaminer } from '../lib/exploitation/paiements.mjs'
export async function verifierPaiements(adresse, secret) {
  if (!secret) throw new Error('Authentification absente')
  const reponse = await fetch(adresse, {
    headers: { Authorization: `Bearer ${secret}` },
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  })
  if (reponse.status !== 200) throw new Error('Etat financier inaccessible')
  return lireEtatPaiements(await reponse.json())
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const etat = await verifierPaiements(
      'https://www.cloison.immo/api/paiement/etat',
      process.env.CRON_SECRET,
    )
    console.log(JSON.stringify(etat))
    if (paiementsAExaminer(etat)) {
      console.error('Paiements a examiner')
      process.exitCode = 1
    }
  } catch {
    console.error('Suivi financier indisponible')
    process.exitCode = 1
  }
}
