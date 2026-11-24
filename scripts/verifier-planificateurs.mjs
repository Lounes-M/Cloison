import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { observerTache } from '../lib/exploitation/planificateurs.mjs'

// La supervision, quand elle tourne, verifie que les deux autres planificateurs
// GitHub tournent aussi. Les controles de cadence regardent la base : ils
// restent verts tant que pg_cron fait le travail a la place de GitHub.
const SURVEILLEES = ['maintenance', 'actes']

/** Rend le bilan des taches et `conforme` ; une lecture impossible n'est jamais un vert. */
export async function verifierPlanificateurs(env, options = {}) {
  const depot = env.GITHUB_REPOSITORY
  const jeton = env.GITHUB_TOKEN
  if (!depot || !jeton) throw new Error('Contexte GitHub absent')
  const taches = {}
  for (const nom of SURVEILLEES)
    taches[nom] = await observerTache(nom, { ...options, depot, jeton })
  return { taches, conforme: SURVEILLEES.every((nom) => taches[nom].etat === 'conforme') }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const bilan = await verifierPlanificateurs(process.env)
    console.log(JSON.stringify(bilan.taches))
    if (!bilan.conforme) {
      console.error('Tache planifiee absente, en echec ou desactivee')
      process.exitCode = 1
    }
  } catch {
    console.error('Etat des taches planifiees illisible')
    process.exitCode = 1
  }
}
