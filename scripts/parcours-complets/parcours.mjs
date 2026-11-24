import { randomBytes } from 'node:crypto'
import { chromium } from 'playwright'
import { demarrerEnvironnement } from './environnement.mjs'
import { Acteur } from './acteurs.mjs'
import { parcoursColocation } from './parcours-colocation.mjs'
import { parcoursIncidents } from './parcours-incidents.mjs'
import { parcoursSimple } from './parcours-simple.mjs'

/**
 * Les parcours complets : agence, locataire, garant, jusqu'a l'acte, dans un
 * vrai navigateur, sur le build de production et un Supabase local.
 *
 *   npx supabase start
 *   NEXT_PUBLIC_SITE_URL=https://localhost:3443 npm run build
 *   node scripts/parcours-complets/parcours.mjs
 *
 * Voir docs/parcours-complets.md.
 */

const CONFIGURATIONS = [
  { langue: 'fr', mobile: false },
  { langue: 'en', mobile: true },
  { langue: 'fr', mobile: true },
  { langue: 'en', mobile: false },
].filter(
  (c) =>
    !process.env.PARCOURS_SEULEMENT ||
    process.env.PARCOURS_SEULEMENT === `${c.langue}-${c.mobile ? 'mobile' : 'ordinateur'}`,
)

const SEULS = process.env.PARCOURS_PARCOURS?.split(',')

const env = await demarrerEnvironnement()
const navigateur = await chromium.launch({
  executablePath: process.env.PARCOURS_CHROMIUM || undefined,
})
const constats = []
const preuves = []
let echec = null
try {
  for (const configuration of CONFIGURATIONS) {
    const nom = `${configuration.langue}-${configuration.mobile ? 'mobile' : 'ordinateur'}`
    // Un identifiant par passage : la base n'a pas a etre vide, et deux
    // passages ne se marchent pas dessus.
    const passage = randomBytes(4).toString('hex')
    let rang = 0
    const monde = {
      ...configuration,
      nom,
      passage,
      env,
      secrets: new Map(),
      noter(preuve) {
        preuves.push(`${nom} : ${preuve}`)
        console.log(`OK [${nom}] ${preuve}`)
      },
      async acteur(role, options = {}) {
        rang += 1
        const acteur = new Acteur(navigateur, {
          nom: `${nom}/${role}`,
          langue: options.langue ?? configuration.langue,
          mobile: options.mobile ?? configuration.mobile,
          ip: `198.51.100.${(Number.parseInt(passage.slice(0, 2), 16) + rang) % 250}`,
          captures: process.env.PARCOURS_CAPTURES,
          constats,
        })
        return acteur.ouvrir()
      },
    }
    if (!SEULS || SEULS.includes('simple')) await parcoursSimple(monde)
    if (!SEULS || SEULS.includes('colocation')) await parcoursColocation(monde)
    if (!SEULS || SEULS.includes('incidents')) await parcoursIncidents(monde)
  }
} catch (erreur) {
  echec = erreur
} finally {
  await navigateur.close()
  await env.fermer()
}

console.log(`\n${preuves.length} preuves.`)
if (constats.length > 0) {
  console.log(`\n${constats.length} constat(s) :`)
  for (const constat of [...new Set(constats)]) console.log(` - ${constat}`)
}
if (echec) {
  console.error(`\nECHEC : ${echec.stack ?? echec}`)
  process.exit(1)
}
if (constats.length > 0) process.exit(1)
console.log('Parcours complets : tout est passe.')
