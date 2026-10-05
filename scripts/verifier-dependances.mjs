import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const avis = 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm'
const chaine = new Set([
  'braces',
  'micromatch',
  'fast-glob',
  '@next/eslint-plugin-next',
  'eslint-config-next',
])

/** Exception temporaire limitee au lint, jamais au code de production. */
export function verifierAudit(rapport, lock, maintenant = new Date()) {
  if (
    rapport.auditReportVersion !== 2 ||
    rapport.error ||
    !rapport.vulnerabilities ||
    !lock.packages
  )
    throw new Error('Rapport de dependances invalide')
  const vulnerabilites = rapport.vulnerabilities
  const expire =
    maintenant >= new Date('2026-10-19T00:00:00Z') || !Number.isFinite(maintenant.getTime())
  function autorisee(nom, parcours = new Set()) {
    const entree = vulnerabilites[nom]
    if (
      expire ||
      parcours.has(nom) ||
      !chaine.has(nom) ||
      !entree ||
      entree.name !== nom ||
      entree.severity !== 'high' ||
      !entree.nodes?.length ||
      !entree.via?.length
    )
      return false
    if (!entree.nodes.every((chemin) => lock.packages[chemin]?.dev === true)) return false
    const suivants = new Set([...parcours, nom])
    return entree.via.every((via) =>
      typeof via === 'string'
        ? autorisee(via, suivants)
        : nom === 'braces' &&
          via.url === avis &&
          via.name === 'braces' &&
          via.range === '<=3.0.3' &&
          via.severity === 'high' &&
          entree.nodes.every((chemin) => lock.packages[chemin].version === '3.0.3'),
    )
  }
  const bloquantes = Object.keys(vulnerabilites).filter(
    (nom) => ['high', 'critical'].includes(vulnerabilites[nom].severity) && !autorisee(nom),
  )
  if (bloquantes.length)
    throw new Error('Avis de securite bloquant : corriger ou examiner les dependances')
  return Object.values(vulnerabilites).some((v) => v.severity === 'high')
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
    const exception = verifierAudit(
      JSON.parse(resultat.stdout),
      JSON.parse(readFileSync('package-lock.json', 'utf8')),
    )
    console.log(
      exception
        ? 'Audit valide avec exception de lint GHSA-vfj7-8cjw-p6xm, expiration le 19 octobre 2026. Voir docs/exploitation/dependances.md.'
        : 'Aucun avis high ou critical.',
    )
  } catch {
    console.error(
      'Controle des dependances refuse. Consulter npm audit et docs/exploitation/dependances.md.',
    )
    process.exitCode = 1
  }
}
