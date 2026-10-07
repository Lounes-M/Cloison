import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { chromium, firefox, webkit } from 'playwright'
import { ouvrirRelaisLocal } from './https-parcours-local.mjs'
import { creerPaquetDroits } from './paquet-droits.mjs'

const reservation = createServer()
reservation.listen(0, '127.0.0.1')
await once(reservation, 'listening')
const port = reservation.address().port
await new Promise((r) => reservation.close(r))
const site = `http://127.0.0.1:${port}`,
  stockage = 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'
const next = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      SUPABASE_URL: stockage,
      SUPABASE_PUBLISHABLE_KEY: 'fixture',
      SUPABASE_JWT_SECRET: 'fixture',
      CLE_MAITRESSE: Buffer.alloc(32, 7).toString('base64'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
)
next.stdout.on('data', () => {})
next.stderr.on('data', () => {})
let relais
try {
  let pret = false
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(site, { signal: AbortSignal.timeout(500) })).ok) {
        pret = true
        break
      }
    } catch {
      /* demarrage */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  assert(pret)
  relais = await ouvrirRelaisLocal(site)
  for (const moteur of [chromium, firefox, webkit]) {
    if (process.env.PARCOURS_MOTEUR && process.env.PARCOURS_MOTEUR !== moteur.name()) continue
    const navigateur = await moteur.launch()
    try {
      for (const largeur of [390, 1280]) {
        const contexte = await navigateur.newContext({
          viewport: { width: largeur, height: 900 },
          ignoreHTTPSErrors: true,
          acceptDownloads: true,
        })
        try {
          const page = await contexte.newPage(),
            erreurs = []
          page.on('pageerror', (e) => erreurs.push(e.message))
          const cle = randomBytes(32),
            id = randomUUID(),
            jeton = randomBytes(32).toString('base64url'),
            contenu = Buffer.from('Donnees fictives de recette')
          const hash = (b) => createHash('sha256').update(b).digest('hex')
          const manifeste = {
            version: 1,
            demande: randomUUID(),
            revision: randomUUID(),
            decisionSha256: 'a'.repeat(64),
            destinataireSha256: 'b'.repeat(64),
            creeLe: new Date(Date.now() - 1000).toISOString(),
            expireLe: new Date(Date.now() + 60000).toISOString(),
            exclusions: [],
            fichiers: [{ nom: 'donnees-0001.txt', taille: contenu.length, sha256: hash(contenu) }],
          }
          const archive = creerPaquetDroits(
            manifeste,
            new Map([['donnees-0001.txt', contenu]]),
            cle,
          )
          let demandes = 0,
            confirmations = 0
          await page.route('**/api/droits/remise', async (route) => {
            const b = route.request().postDataJSON()
            assert.equal(b.id, id)
            assert.equal(b.jeton, jeton)
            assert(!JSON.stringify(b).includes(cle.toString('base64')))
            assert.match(b.preuve, /^[A-Za-z0-9_-]{43}$/)
            if (b.confirmer) confirmations++
            else demandes++
            if (b.telecharger) {
              await route.fulfill({
                body: archive,
                headers: { 'content-type': 'application/octet-stream' },
              })
              return
            }
            await route.fulfill({
              json: b.confirmer
                ? { recu: true }
                : {
                    id,
                    manifeste,
                    taille: archive.length,
                    sha256: hash(archive),
                    expireLe: manifeste.expireLe,
                    secondes: 30,
                    recu: false,
                  },
            })
          })
          const r = await page.goto(`${relais.site}/remise-donnees#id=${id}&jeton=${jeton}`)
          assert.equal(r.status(), 200)
          assert(!r.headers()['content-security-policy'].includes(stockage))
          await page.waitForFunction(() => location.hash === '')
          await page.getByLabel('Clé de récupération').fill(cle.toString('base64'))
          await page.getByLabel('Clé de récupération').press('Enter')
          const lien = page.getByRole('link', { name: 'Télécharger donnees-0001.txt' })
          await lien.waitFor()
          await lien.focus()
          const telechargement = page.waitForEvent('download')
          await page.keyboard.press('Enter')
          const download = await telechargement
          const flux = await download.createReadStream(),
            blocs = []
          for await (const b of flux) blocs.push(b)
          assert.deepEqual(Buffer.concat(blocs), contenu)
          await page
            .getByRole('button', { name: 'Confirmer que j’ai récupéré mes fichiers' })
            .click()
          await page.getByText('Ta confirmation de réception a été enregistrée.').waitFor()
          assert.equal(demandes, 2)
          assert.equal(confirmations, 1)
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          await page.getByRole('button', { name: 'Fermer et effacer cette session' }).click()
          await page.getByLabel('Clé de récupération').waitFor()
          assert.equal(await page.getByLabel('Clé de récupération').inputValue(), '')
          assert.deepEqual(erreurs, [])
          console.log(
            `OK : remise locale, clavier, reception et fermeture ${moteur.name()} ${largeur}`,
          )
        } finally {
          await contexte.close()
        }
      }
    } finally {
      await navigateur.close()
    }
  }
} finally {
  await relais?.fermer()
  if (next.exitCode === null) {
    const fin = once(next, 'exit')
    next.kill()
    await fin.catch(() => {})
  }
}
