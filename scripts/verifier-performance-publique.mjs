import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile, readdir, stat } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import { join } from 'node:path'

/**
 * Garde-fous de performance du site public, rejoues apres chaque build.
 *
 * Trois derives silencieuses, que rien d'autre ne voit :
 *
 * 1. Une page publique qui cesse d'etre prerendue. Il suffit qu'un composant
 *    partage lise un cookie pour que toutes les pages soient rendues a chaque
 *    visite : le site reste juste, il devient lent, et aucun test ne casse.
 * 2. Le poids de ce qu'une page fait telecharger avant de s'afficher : HTML,
 *    scripts, styles et polices, mesures compresses comme le navigateur les
 *    recoit. Une bibliotheque importee par megarde dans un composant client
 *    s'y voit tout de suite.
 * 3. Le poids des photos et des videos deposees dans `public/`.
 *
 * Aucun navigateur : le serveur de production est interroge en HTTP, et les
 * ressources critiques sont lues dans le HTML qu'il rend. Les budgets sont
 * des plafonds, pas des cibles : les releves du moment sont affiches a
 * chaque execution, pour qu'on les resserre quand le site maigrit.
 */

const KO = 1024

/** Pages publiques qui doivent sortir du build deja rendues. */
const PRERENDUES = [
  '/',
  '/agences',
  '/questions',
  '/intelligence-artificielle',
  '/mentions-legales',
  '/confidentialite',
  '/conditions',
]

/** Pages publiques rendues a la demande, par construction (nonce, session). */
const A_LA_DEMANDE = ['/demarrer', '/connexion']

/** Plafonds par page, en octets compresses. */
const BUDGET_PAGE = {
  document: 40 * KO,
  scripts: 215 * KO,
  styles: 26 * KO,
  polices: 45 * KO,
  total: 320 * KO,
}

/** Plafonds des fichiers servis tels quels depuis `public/`. */
const BUDGET_FICHIER = [
  { motif: /\.(jpe?g|png|webp|avif)$/, plafond: 260 * KO, nature: 'image' },
  { motif: /\.(mp4|webm)$/, plafond: 1300 * KO, nature: 'video' },
]
const BUDGET_PUBLIC_TOTAL = 3600 * KO

const ko = (octets) => `${(octets / KO).toFixed(1)} Ko`

/** Octets recus sur le fil pour une adresse, compression comprise. */
function telecharger(origine, chemin) {
  return new Promise((resolve, reject) => {
    const requete = request(
      new URL(chemin, origine),
      { headers: { 'accept-encoding': 'gzip', accept: 'text/html,*/*' } },
      (reponse) => {
        const blocs = []
        reponse.on('data', (bloc) => blocs.push(bloc))
        reponse.on('end', () =>
          resolve({
            statut: reponse.statusCode,
            entetes: reponse.headers,
            brut: Buffer.concat(blocs),
          }),
        )
      },
    )
    requete.on('error', reject)
    requete.setTimeout(15000, () => requete.destroy(new Error(`Delai depasse : ${chemin}`)))
    requete.end()
  })
}

async function decompresser(reponse) {
  if (reponse.entetes['content-encoding'] !== 'gzip') return reponse.brut.toString('utf8')
  const { gunzipSync } = await import('node:zlib')
  return gunzipSync(reponse.brut).toString('utf8')
}

/** Ressources que le HTML fait charger avant l'affichage, par nature. */
export function ressourcesCritiques(html) {
  const balises = html.match(/<(?:script|link)\b[^>]*>/g) ?? []
  const attribut = (balise, nom) =>
    balise.match(new RegExp(`\\s${nom}="([^"]*)"`))?.[1].replaceAll('&amp;', '&')
  const ressources = { scripts: new Set(), styles: new Set(), polices: new Set() }
  for (const balise of balises) {
    if (balise.startsWith('<script')) {
      const src = attribut(balise, 'src')
      if (src?.startsWith('/')) ressources.scripts.add(src)
      continue
    }
    const href = attribut(balise, 'href')
    if (!href?.startsWith('/')) continue
    const rel = attribut(balise, 'rel')
    const nature = attribut(balise, 'as')
    if (rel === 'stylesheet') ressources.styles.add(href)
    else if (rel === 'preload' && nature === 'font') ressources.polices.add(href)
    else if (rel === 'preload' && nature === 'script') ressources.scripts.add(href)
    else if (rel === 'preload' && nature === 'style') ressources.styles.add(href)
  }
  return ressources
}

async function verifierPrerendu() {
  const manifeste = JSON.parse(await readFile('.next/prerender-manifest.json', 'utf8'))
  const prerendues = new Set(Object.keys(manifeste.routes))
  const attendues = PRERENDUES.flatMap((chemin) => [
    chemin,
    chemin === '/' ? '/en' : `/en${chemin}`,
  ])
  assert.deepEqual(
    attendues.filter((chemin) => !prerendues.has(chemin)),
    [],
    'Pages publiques rendues a chaque visite au lieu d etre prerendues. ' +
      'Cherche une lecture de cookie, d en-tete ou `connection()` dans un composant partage.',
  )
  // Contre-preuve : le manifeste distingue bien les pages a la demande.
  for (const chemin of A_LA_DEMANDE)
    assert(!prerendues.has(chemin), `${chemin} doit rester rendue a la demande`)
  console.log(`OK : ${attendues.length} pages publiques prerendues au build`)
}

async function verifierFichiersPublics() {
  let total = 0
  const depassements = []
  for (const nom of await readdir('public', { recursive: true })) {
    const chemin = join('public', nom)
    const fiche = await stat(chemin)
    if (!fiche.isFile()) continue
    total += fiche.size
    const regle = BUDGET_FICHIER.find(({ motif }) => motif.test(nom))
    if (regle && fiche.size > regle.plafond)
      depassements.push(`${nom} : ${ko(fiche.size)} pour ${ko(regle.plafond)} (${regle.nature})`)
  }
  assert.deepEqual(depassements, [], 'Fichier public trop lourd')
  assert(
    total <= BUDGET_PUBLIC_TOTAL,
    `Dossier public trop lourd : ${ko(total)} pour ${ko(BUDGET_PUBLIC_TOTAL)}`,
  )
  console.log(`OK : dossier public ${ko(total)} sur ${ko(BUDGET_PUBLIC_TOTAL)}`)
}

async function demarrerNext() {
  const reservation = createServer()
  reservation.listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = reservation.address().port
  await new Promise((r) => reservation.close(r))
  const origine = `http://127.0.0.1:${port}`
  const next = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        // Aucun service n'est joint : les pages mesurees n'appellent rien.
        SUPABASE_URL: 'http://127.0.0.1:9',
        SUPABASE_PUBLISHABLE_KEY: 'fixture',
        SUPABASE_JWT_SECRET: 'fixture',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  next.stdout.on('data', () => {})
  next.stderr.on('data', () => {})
  const limite = Date.now() + 30000
  while (Date.now() < limite && next.exitCode === null) {
    try {
      if ((await telecharger(origine, '/')).statut === 200) return { next, origine }
    } catch {
      /* demarrage */
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  next.kill('SIGTERM')
  throw new Error('Le serveur de production ne demarre pas : lancer `npm run build` avant')
}

async function verifierPoids(origine) {
  const tailles = new Map()
  const poids = async (chemin) => {
    if (!tailles.has(chemin)) {
      const reponse = await telecharger(origine, chemin)
      assert.equal(reponse.statut, 200, `Ressource absente : ${chemin}`)
      tailles.set(chemin, reponse.brut.length)
    }
    return tailles.get(chemin)
  }
  const depassements = []
  const releves = []
  const pages = [...PRERENDUES, ...A_LA_DEMANDE].flatMap((chemin) => [
    chemin,
    chemin === '/' ? '/en' : `/en${chemin}`,
  ])
  for (const chemin of pages) {
    const reponse = await telecharger(origine, chemin)
    assert.equal(reponse.statut, 200, `Page publique indisponible : ${chemin}`)
    const ressources = ressourcesCritiques(await decompresser(reponse))
    const mesure = { document: reponse.brut.length, scripts: 0, styles: 0, polices: 0 }
    for (const nature of ['scripts', 'styles', 'polices'])
      for (const ressource of ressources[nature]) mesure[nature] += await poids(ressource)
    mesure.total = mesure.document + mesure.scripts + mesure.styles + mesure.polices
    // Une page sans script ni style serait une page mal lue, pas une page legere.
    assert(mesure.scripts > 0 && mesure.styles > 0, `Ressources illisibles : ${chemin}`)
    releves.push(
      `${chemin.padEnd(32)} total ${ko(mesure.total).padStart(9)}  scripts ${ko(mesure.scripts).padStart(9)}  styles ${ko(mesure.styles).padStart(8)}  polices ${ko(mesure.polices).padStart(8)}  document ${ko(mesure.document).padStart(8)}`,
    )
    for (const [nature, plafond] of Object.entries(BUDGET_PAGE))
      if (mesure[nature] > plafond)
        depassements.push(`${chemin} ${nature} : ${ko(mesure[nature])} pour ${ko(plafond)}`)
  }
  console.log(releves.join('\n'))
  assert.deepEqual(depassements, [], 'Budget de poids depasse')
  console.log(`OK : ${pages.length} pages publiques sous leur budget de poids`)
}

// Contre-preuve du lecteur de ressources : sans elle, une evolution du HTML
// de Next ferait passer toutes les pages pour vides, donc pour legeres.
assert.deepEqual(
  ressourcesCritiques(
    '<link rel="stylesheet" href="/a.css"/><link rel="preload" as="font" href="/f.woff2?x=1&amp;y=2"/>' +
      '<script src="/b.js" async=""></script><script src="https://exemple.invalid/c.js"></script>' +
      '<link rel="preload" as="image" href="/i.jpg"/>',
  ),
  {
    scripts: new Set(['/b.js']),
    styles: new Set(['/a.css']),
    polices: new Set(['/f.woff2?x=1&y=2']),
  },
)

await verifierPrerendu()
await verifierFichiersPublics()
const { next, origine } = await demarrerNext()
try {
  await verifierPoids(origine)
} finally {
  next.kill('SIGTERM')
}
