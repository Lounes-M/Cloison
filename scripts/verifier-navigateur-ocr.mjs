import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'
import { chromium, firefox, webkit } from 'playwright'
import { ouvrirRelaisLocal } from './https-parcours-local.mjs'
import { parcourirConnecteur } from './parcours-connecteur-navigateur.mjs'
import { parcourirExamen } from './parcours-examen-navigateur.mjs'
import { parcourirResponsable } from './parcours-responsable-navigateur.mjs'
import { parcourirPreferences } from './parcours-preferences-navigateur.mjs'
import { parcourirRappels } from './parcours-rappels-navigateur.mjs'
import { parcourirInterface } from './parcours-interface-navigateur.mjs'

// Auth et donnees fictives, Next et composant reels. Aucun appel IA : POST intercepte.
const id = '11111111-1111-4111-8111-111111111111',
  maintenant = Math.floor(Date.now() / 1000)
const encoder = (v) => Buffer.from(JSON.stringify(v)).toString('base64url')
const corps = `${encoder({ alg: 'HS256' })}.${encoder({ sub: id, role: 'authenticated', aal: 'aal2', iat: maintenant, exp: maintenant + 3600 })}`
const jeton = `${corps}.${createHmac('sha256', 'fixture-sans-valeur').update(corps).digest('base64url')}`
const user = {
  id,
  email: 'essai@example.invalid',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  factors: [],
}
let clesConnecteurs = []
let examensDocumentaires = [],
  examenConflit = false
const collegue = '22222222-2222-4222-8222-222222222222'
let filtreDossiers = new URLSearchParams()
let preference = { mode: 'tous', revision: null },
  conflitPreference = false
let reglagesRappels = { relance_jours: 0, echeance_jours: 0, revision: null },
  conflitRappels = false
let responsable = null,
  revisionResponsable = null,
  conflitResponsable = false,
  roleCourant = 'admin'
const api = createServer(async (req, res) => {
  const blocs = []
  for await (const bloc of req) blocs.push(bloc)
  const entree = blocs.length ? JSON.parse(Buffer.concat(blocs).toString('utf8')) : {}
  res.setHeader('Content-Type', 'application/json')
  const url = new URL(req.url, 'http://127.0.0.1'),
    path = url.pathname
  let valeur = []
  if (path === '/auth/v1/user') valeur = user
  else if (path.endsWith('/rpc/rejoindre_ou_creer_agence')) valeur = id
  else if (path.endsWith('/agences'))
    valeur = [
      { id, nom: 'Agence fictive', domaine: 'example.invalid', statut: 'verifiee', seuil_ratio: 3 },
    ]
  else if (path.endsWith('/membres_agence')) valeur = [{ role: roleCourant }]
  else if (path.endsWith('/rpc/reglages_rappels_agence'))
    valeur = roleCourant === 'admin' ? [reglagesRappels] : []
  else if (path.endsWith('/rpc/regler_rappels')) {
    assert([0, 3, 7, 14].includes(entree.relance))
    assert([0, 3, 7].includes(entree.echeance))
    if (
      roleCourant !== 'admin' ||
      conflitRappels ||
      entree.revision_attendue !== reglagesRappels.revision
    )
      valeur = null
    else {
      reglagesRappels = {
        relance_jours: entree.relance,
        echeance_jours: entree.echeance,
        revision: randomUUID(),
      }
      valeur = reglagesRappels.revision
    }
  } else if (path.endsWith('/rpc/mes_preferences_notifications')) valeur = [preference]
  else if (path.endsWith('/rpc/regler_notifications')) {
    assert(['tous', 'mes', 'aucun'].includes(entree.le_mode))
    if (conflitPreference || entree.revision_attendue !== preference.revision) valeur = null
    else {
      preference = { mode: entree.le_mode, revision: randomUUID() }
      valeur = preference.revision
    }
  } else if (path.endsWith('/rpc/jeton_est_actif')) valeur = true
  else if (path.endsWith('/dossiers'))
    valeur = [
      {
        id,
        reference: 'OCRFICTIF',
        statut: 'complet',
        email_locataire: 'locataire@example.invalid',
        email_garant: 'garant@example.invalid',
        loyer_cents: 100000,
        cree_le: new Date().toISOString(),
        expire_le: new Date(Date.now() + 86400000).toISOString(),
      },
    ]
  else if (path.endsWith('/pieces'))
    valeur = [
      {
        id,
        type: 'bulletin_paie',
        taille_octets: 100,
        nombre_documents: 1,
        depose_le: new Date().toISOString(),
      },
    ]
  else if (path.endsWith('/rpc/journaliser')) valeur = id
  else if (path.endsWith('/rpc/reserver_lecture_ocr')) valeur = false
  else if (path.endsWith('/rpc/responsables_des_dossiers'))
    valeur = [
      {
        dossier_id: id,
        revision: revisionResponsable,
        responsable_id: responsable,
        responsable_email:
          responsable === id ? user.email : responsable ? 'collegue@example.invalid' : null,
        modifie_le: revisionResponsable ? new Date().toISOString() : null,
      },
    ]
  else if (path.endsWith('/rpc/collaborateurs_agence')) {
    assert.equal(roleCourant, 'admin')
    valeur = [
      { utilisateur_id: id, email: user.email, etat: 'admin', admissible: true },
      {
        utilisateur_id: collegue,
        email: 'collegue@example.invalid',
        etat: 'membre',
        admissible: true,
      },
    ]
  } else if (path.endsWith('/rpc/affecter_dossier')) {
    assert.equal(entree.le_dossier, id)
    assert([null, id, collegue].includes(entree.le_membre))
    if (conflitResponsable || entree.revision_attendue !== revisionResponsable) valeur = null
    else {
      responsable = entree.le_membre
      revisionResponsable = randomUUID()
      valeur = revisionResponsable
    }
  } else if (path.endsWith('/rpc/examens_du_dossier')) valeur = examensDocumentaires
  else if (path.endsWith('/rpc/enregistrer_examen_documentaire')) {
    assert.equal(entree.le_dossier, id)
    assert.equal(entree.la_piece, id)
    if (examenConflit || entree.revision_attendue !== (examensDocumentaires[0]?.revision ?? null))
      valeur = null
    else {
      valeur = randomUUID()
      examensDocumentaires = [
        {
          piece_id: id,
          revision: valeur,
          etat: entree.le_statut,
          cree_le: new Date().toISOString(),
          acteur: user.email,
        },
      ]
    }
  } else if (path.endsWith('/connecteurs_agence')) valeur = clesConnecteurs
  else if (path.endsWith('/rpc/creer_connecteur')) {
    assert.match(entree.l_empreinte, /^[a-f0-9]{64}$/)
    clesConnecteurs.push({
      id,
      nom: entree.le_nom,
      cree_le: new Date().toISOString(),
      expire_le: new Date(Date.now() + 86400000).toISOString(),
      revoque_le: null,
      utilise_le: null,
    })
    valeur = id
  } else if (path.endsWith('/rpc/revoquer_connecteur')) {
    assert.equal(entree.le_connecteur, id)
    clesConnecteurs = clesConnecteurs.map((c) => ({ ...c, revoque_le: new Date().toISOString() }))
    valeur = true
  } else if (
    ![
      '/rest/v1/engagements',
      '/rest/v1/complements_documentaires',
      '/rest/v1/rpc/journal_du_dossier',
      '/rest/v1/rpc/journal_de_mon_agence',
      '/rest/v1/rpc/mon_tarif_paiement',
    ].includes(path)
  ) {
    res.writeHead(404).end('{}')
    return
  }
  if (path.endsWith('/dossiers')) {
    filtreDossiers = url.searchParams
    if (url.searchParams.get('affecte') === 'not.is.null') {
      assert.equal(url.searchParams.get('affecte.membre_id'), `eq.${id}`)
      if (responsable !== id) valeur = []
    }
    if (url.searchParams.get('affecte') === 'is.null') {
      assert.equal(url.searchParams.get('affecte.membre_id'), 'not.is.null')
      if (responsable !== null) valeur = []
    }
    if (url.searchParams.has('statut')) {
      assert.equal(url.searchParams.get('statut'), 'eq.complet')
    }
  }
  if (req.headers.accept?.includes('vnd.pgrst.object') && Array.isArray(valeur))
    valeur = valeur[0] ?? null
  res.end(JSON.stringify(valeur))
})
api.listen(0, '127.0.0.1')
await once(api, 'listening')
const reservation = createServer()
reservation.listen(0, '127.0.0.1')
await once(reservation, 'listening')
const port = reservation.address().port
await new Promise((r) => reservation.close(r))
const site = `http://127.0.0.1:${port}`
const next = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SITE_URL: site,
      SUPABASE_URL: `http://127.0.0.1:${api.address().port}`,
      SUPABASE_PUBLISHABLE_KEY: 'fixture',
      SUPABASE_JWT_SECRET: 'fixture',
      OCR_ACTIVE: 'true',
      OPENROUTER_API_KEY: 'cle-fictive-sans-valeur',
      EMAIL_SUPPORT: 'support@example.invalid',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)
// Drainer les flux sans conserver les avertissements SDK ni les donnees de test.
next.stdout.on('data', () => {})
next.stderr.on('data', () => {})
let relais
try {
  let pret = false
  const demarrageAvant = Date.now() + 30000
  for (let i = 0; i < 300 && Date.now() < demarrageAvant; i++) {
    try {
      if ((await fetch(site, { signal: AbortSignal.timeout(500) })).ok) {
        pret = true
        break
      }
    } catch {
      /* demarrage */
    }
    if (next.exitCode !== null) break
    await new Promise((r) => setTimeout(r, 100))
  }
  assert(pret, 'Build OCR indisponible')
  relais = await ouvrirRelaisLocal(site)
  for (const moteur of [chromium, firefox, webkit]) {
    const navigateur = await moteur.launch()
    try {
      for (const largeur of moteur.name() === 'chromium' ? [320, 390, 1280] : [390, 1280]) {
        clesConnecteurs = []
        examensDocumentaires = []
        examenConflit = false
        responsable = null
        preference = { mode: 'tous', revision: null }
        conflitPreference = false
        reglagesRappels = { relance_jours: 0, echeance_jours: 0, revision: null }
        conflitRappels = false
        revisionResponsable = null
        conflitResponsable = false
        roleCourant = 'admin'
        const contexte = await navigateur.newContext({
          viewport: { width: largeur, height: 900 },
          ignoreHTTPSErrors: true,
          serviceWorkers: 'block',
        })
        try {
          let demandes = 0,
            panne = false
          await contexte.route('**/*', (route) =>
            new URL(route.request().url()).origin === new URL(relais.site).origin
              ? route.continue()
              : route.abort(),
          )
          await contexte.route(`**/espace/pieces/${id}`, (route) => {
            assert.equal(route.request().method(), 'POST')
            demandes++
            assert.equal(route.request().headers()['x-cloison-ocr'], 'lecture-explicite')
            return route.fulfill({
              status: panne ? 503 : 200,
              contentType: 'application/json',
              body: JSON.stringify({
                pages: [
                  { page: 1, texte: 'Texte OCR fictif <script>window.ocrInjecte=true</script>' },
                ],
                modele: 'fictif/modele',
                empreinte: 'a'.repeat(64),
                observeLe: new Date().toISOString(),
              }),
            })
          })
          const session = {
            access_token: jeton,
            refresh_token: 'fictif',
            expires_in: 3600,
            expires_at: maintenant + 3600,
            token_type: 'bearer',
            user,
          }
          await contexte.addCookies([
            {
              name: 'sb-127-auth-token',
              value: `base64-${encoder(session)}`,
              url: relais.site,
              httpOnly: true,
              sameSite: 'Lax',
            },
          ])
          const page = await contexte.newPage()
          await page.addInitScript(() => {
            window.__cloisonEvalInterdit = []
            document.addEventListener('securitypolicyviolation', (e) => {
              if (e.blockedURI === 'eval') window.__cloisonEvalInterdit.push(e.violatedDirective)
            })
          })
          page.setDefaultTimeout(10000)
          await page.goto(`${relais.site}/espace/dossiers/${id}`)
          await page.getByText('Aide à la lecture', { exact: true }).click()
          const bouton = page.getByRole('button', { name: 'Extraire le texte', exact: true })
          assert(await bouton.isDisabled(), 'Accord OCR absent')
          assert.equal(demandes, 0)
          await page.getByRole('checkbox', { name: 'Envoyer cette copie à', exact: false }).check()
          await bouton.focus()
          await page.keyboard.press('Enter')
          await page.getByText('Texte OCR fictif', { exact: false }).waitFor()
          assert.equal(demandes, 1)
          assert.equal(await page.evaluate(() => window.ocrInjecte), undefined, 'HTML OCR execute')
          assert(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            'Debordement OCR mobile',
          )
          assert.equal(
            await page.evaluate(() => localStorage.length),
            0,
            'OCR conserve en stockage local',
          )
          await page.getByRole('button', { name: 'Effacer la transcription' }).click()
          assert.equal(await page.getByText('Texte OCR fictif', { exact: false }).count(), 0)
          panne = true
          await bouton.click()
          await page.getByText('Lecture indisponible :', { exact: false }).waitFor()
          await page.getByText('Aide à la lecture', { exact: true }).click()
          await page.getByText('Aide à la lecture', { exact: true }).click()
          assert(await bouton.isDisabled(), 'Accord conserve apres fermeture')
          console.log(
            `OK : OCR ${moteur.name()} ${largeur}, accord, clavier, texte inerte, effacement et panne`,
          )
          await parcourirConnecteur(page, relais.site, moteur, largeur)
          await parcourirExamen(page, relais.site, id, moteur, largeur, (v) => {
            examenConflit = v
          })
          await parcourirResponsable(page, relais.site, id, collegue, moteur, largeur, {
            filtre: () => filtreDossiers,
            conflit: (v) => {
              conflitResponsable = v
            },
            role: (v) => {
              roleCourant = v
            },
          })
          roleCourant = 'admin'
          await parcourirPreferences(page, relais.site, moteur, largeur, (v) => {
            conflitPreference = v
          })
          await parcourirRappels(page, relais.site, moteur, largeur, {
            conflit: (v) => {
              conflitRappels = v
            },
            role: (v) => {
              roleCourant = v
            },
          })
          await parcourirInterface(page, relais.site, id, moteur, largeur, session)
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
    const termine = once(next, 'exit')
    next.kill()
    await termine.catch(() => {})
  }
  api.closeAllConnections()
  await new Promise((r) => api.close(r))
}
