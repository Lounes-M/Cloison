import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/** Tout avis high ou critical bloque, sans exception. */
export function verifierAudit(rapport) {
  if (rapport.auditReportVersion !== 2 || rapport.error || !rapport.vulnerabilities)
    throw new Error('Rapport de dependances invalide')
  const bloquantes = Object.values(rapport.vulnerabilities).filter((v) =>
    ['high', 'critical'].includes(v.severity),
  )
  if (bloquantes.length)
    throw new Error('Avis de securite bloquant : corriger ou examiner les dependances')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.env.npm_execpath) throw new Error('Utiliser npm run check:dependencies')
    const resultat = spawnSync(process.execPath, [process.env.npm_execpath, 'audit', '--json'], {
      encoding: 'utf8',
      timeout: 90000,
      maxBuffer: 4 * 1024 * 1024,
    })
    if (resultat.error || ![0, 1].includes(resultat.status)) throw new Error('Audit indisponible')
    verifierAudit(JSON.parse(resultat.stdout))
    console.log('Aucun avis high ou critical.')
  } catch {
    console.error(
      'Controle des dependances refuse. Consulter npm audit et docs/exploitation/dependances.md.',
    )
    process.exitCode = 1
  }
}
