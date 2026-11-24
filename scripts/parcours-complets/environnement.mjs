import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'
import { ouvrirFauxFournisseurs } from './faux-fournisseurs.mjs'

/**
 * L'environnement des parcours complets.
 *
 * Trois pieces, toutes sur la boucle locale :
 *
 * 1. le Supabase local (`supabase start`), deja demarre : Postgres, Auth,
 *    PostgREST, Storage, boite aux lettres ;
 * 2. les faux fournisseurs (Resend, OpenRouter) ;
 * 3. le build de production de Next, servi en HTTPS parce que les cookies de
 *    session sont `secure` et que la CSP porte upgrade-insecure-requests.
 *    Seul son certificat, genere pour un jour, est fictif.
 */

export const SITE = 'https://localhost:3443'
const PORT_SITE = 3443
const PORT_FAUX = 3460
export const SUPABASE = {
  api: 'http://127.0.0.1:54321',
  base: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  courrier: 'http://127.0.0.1:54324',
  // Les valeurs par defaut de `supabase start` : publiques, sans aucune portee
  // hors de la boucle locale. `supabase status -o env` donne celles de la
  // machine si elles different.
  clePubliable:
    process.env.PARCOURS_CLE_PUBLIABLE || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
  secretJwt:
    process.env.PARCOURS_SECRET_JWT || 'super-secret-jwt-token-with-at-least-32-characters-long',
}
export const CRON_SECRET = 'parcours-complets-strictement-locaux'
const racine = fileURLToPath(new URL('../..', import.meta.url))

function certificatEphemere() {
  const repertoire = mkdtempSync(join(tmpdir(), 'cloison-parcours-'))
  const cle = join(repertoire, 'cle.pem')
  const certificat = join(repertoire, 'certificat.pem')
  execFileSync(
    'openssl',
    [
      ...['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', cle, '-out', certificat],
      ...['-days', '1', '-subj', '/CN=localhost'],
      ...['-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'],
    ],
    { stdio: 'ignore', timeout: 15000 },
  )
  return { repertoire, cle, certificat }
}

export async function demarrerEnvironnement() {
  const db = new pg.Client({ connectionString: SUPABASE.base })
  await db.connect()
  assert(
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(db.connection.stream.remoteAddress),
    'Base locale obligatoire',
  )
  const faux = await ouvrirFauxFournisseurs(PORT_FAUX)
  let journal = ''
  const tls = certificatEphemere()
  const next = spawn(process.execPath, ['scripts/parcours-complets/serveur-next.mjs'], {
    cwd: racine,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      NODE_OPTIONS: `--import ${pathToFileURL(join(racine, 'scripts/parcours-complets/prechargement.mjs'))}`,
      NEXT_TELEMETRY_DISABLED: '1',
      PARCOURS_FAUX_FOURNISSEURS: faux.url,
      PARCOURS_PORT: String(PORT_SITE),
      PARCOURS_CLE: tls.cle,
      PARCOURS_CERTIFICAT: tls.certificat,
      NEXT_PUBLIC_SITE_URL: SITE,
      SUPABASE_URL: SUPABASE.api,
      SUPABASE_PUBLISHABLE_KEY: SUPABASE.clePubliable,
      SUPABASE_JWT_SECRET: SUPABASE.secretJwt,
      CLE_MAITRESSE: Buffer.alloc(32, 7).toString('base64'),
      CRON_SECRET,
      RESEND_API_KEY: 're_parcours_strictement_local',
      RESEND_BASE_URL: `${faux.url}/resend`,
      EMAIL_DESTINATAIRE: 'exploitation@cloison.invalid',
      EMAIL_EXPEDITEUR: 'Cloison <bonjour@cloison.invalid>',
      EMAIL_SUPPORT: 'support@cloison.invalid',
      OPENROUTER_API_KEY: 'sk-or-parcours-strictement-local',
      LECTURE_IA_GARANT: 'true',
      COMPARAISON_IA_AGENCE: 'true',
      OCR_ACTIVE: 'true',
      SAUVEGARDE_RETENTION_JOURS: '7',
      // Next suit lui-meme certaines redirections vers sa propre adresse.
      NODE_EXTRA_CA_CERTS: tls.certificat,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const noter = (b) => {
    journal = (journal + b).slice(-20_000)
    if (process.env.PARCOURS_JOURNAL_NEXT) process.stderr.write(b)
  }
  next.stdout.on('data', noter)
  next.stderr.on('data', noter)
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  let pret = false
  for (let i = 0; i < 150 && next.exitCode === null; i++) {
    try {
      if ((await fetch(`${SITE}/`, { redirect: 'manual' })).status < 500) {
        pret = true
        break
      }
    } catch {
      /* Demarrage. */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  const fermer = async () => {
    next.kill('SIGTERM')
    rmSync(tls.repertoire, { recursive: true, force: true })
    await faux.fermer()
    await db.end()
  }
  if (!pret) {
    await fermer()
    throw new Error(`Next indisponible : ${journal}`)
  }
  return { site: SITE, db, faux, journalNext: () => journal, fermer }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = await demarrerEnvironnement()
  console.log(`Environnement pret : ${env.site}`)
  process.on('SIGINT', () => env.fermer().then(() => process.exit(0)))
  process.on('SIGTERM', () => env.fermer().then(() => process.exit(0)))
}
