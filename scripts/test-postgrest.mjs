import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Client } from 'pg'
import { SignJWT } from 'jose'
import { verifierConcurrenceDepot } from './verifier-concurrence-depot.mjs'
import { verifierConcurrencePaiements } from './verifier-concurrence-paiements.mjs'
import { verifierConcurrenceAdministrateurs } from './verifier-concurrence-administrateurs.mjs'
import { verifierDiagnosticPaiement } from './verifier-diagnostic-paiement.mjs'
import { verifierDecisionsPaiements } from './verifier-decisions-paiements.mjs'
import { verifierConcurrenceOcr } from './verifier-concurrence-ocr.mjs'
import { verifierConcurrenceConnecteurs } from './verifier-concurrence-connecteurs.mjs'

export async function preparerBase(db) {
  await db.query(readFileSync('supabase/essais/harnais-supabase.sql', 'utf8'))
  for (const fichier of readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await db.query(readFileSync(`supabase/migrations/${fichier}`, 'utf8'))
  }
  await db.query("alter role authenticator login password 'cloison-test-only'")
  await db.query("notify pgrst, 'reload schema'")
}

export async function verifierPostgrest(db, adresse, secret) {
  let disponible = false
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${adresse}/`, { signal: AbortSignal.timeout(1000) })
      if (r.ok) {
        disponible = true
        break
      }
    } catch {
      /* Demarrage du service isole. */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  assert(disponible, 'PostgREST de test indisponible')
  const {
    rows: [dossier],
  } = await db.query(
    "insert into dossiers(email_locataire,reference) values ('http@audit.invalid','HTTP12345678') returning id",
  )
  const {
    rows: [lien],
  } = await db.query(
    "insert into jetons_actifs(dossier_id,partie,jti,expire_le) values ($1,'locataire',gen_random_uuid(),now()+interval '7 days') returning jti",
    [dossier.id],
  )
  const signer = (claims) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret))
  const jeton = await signer({
    role: 'porteur_lien',
    role_partie: 'locataire',
    dossier_id: dossier.id,
    jti: lien.jti,
  })
  const lire = async (jwt) => {
    const r = await fetch(`${adresse}/dossiers?select=id`, {
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      signal: AbortSignal.timeout(5000),
    })
    return { status: r.status, body: await r.json() }
  }
  assert.deepEqual((await lire(jeton)).body, [{ id: dossier.id }])
  console.log('OK : lien valide et claims JSON')
  await db.query('update jetons_actifs set jti=gen_random_uuid() where dossier_id=$1', [dossier.id])
  assert.deepEqual((await lire(jeton)).body, [])
  console.log('OK : lien revoque sans acces')
  assert.equal((await lire(jeton.slice(0, -8) + 'invalide')).status, 401)
  console.log('OK : signature falsifiee refusee')
  const anonyme = await lire()
  assert(anonyme.status === 401 || JSON.stringify(anonyme.body) === '[]')
  console.log('OK : aucun acces anonyme')
  const fonctionsInternes = [
    ['rapport_exploitation', {}],
    ['empreinte_schema', {}],
    ['marquer_dossier_paye', { le_dossier: dossier.id, la_reference: 'pi_refuse_audit_http' }],
    [
      'retrouver_lien_locataire',
      { courriel: 'http@audit.invalid', reference_dossier: 'HTTP12345678' },
    ],
    ['pieces_suffisantes', { le_dossier: dossier.id }],
    ['purger_les_dossiers_expires', {}],
    ['emettre_jeton', { le_dossier: dossier.id, la_partie: 'locataire', duree: '7 days' }],
  ]
  const avant = (
    await db.query(
      'select paye_le, jti from dossiers d join jetons_actifs j on j.dossier_id=d.id where d.id=$1',
      [dossier.id],
    )
  ).rows
  for (const jwt of [
    null,
    await signer({ role: 'authenticated', sub: '11111111-1111-1111-1111-111111111111' }),
  ]) {
    for (const [fonction, argumentsRpc] of fonctionsInternes) {
      const r = await fetch(`${adresse}/rpc/${fonction}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify(argumentsRpc),
        signal: AbortSignal.timeout(5000),
      })
      assert([401, 403].includes(r.status), `${fonction} accessible : HTTP ${r.status}`)
      assert.equal(
        (await r.json()).code,
        '42501',
        `${fonction} doit etre refusee par les droits SQL`,
      )
    }
  }
  const apres = (
    await db.query(
      'select paye_le, jti from dossiers d join jetons_actifs j on j.dossier_id=d.id where d.id=$1',
      [dossier.id],
    )
  ).rows
  assert.deepEqual(apres, avant)
  console.log(
    'OK : paiement, recuperation, purge et calcul internes refuses via HTTP, sans mutation',
  )
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const connexion = process.env.PGTEST_URL
  const adresse = process.env.POSTGREST_TEST_URL
  const secret = process.env.POSTGREST_TEST_SECRET
  assert(connexion && adresse && secret, 'Configuration de test manquante')
  const pg = new URL(connexion)
  const http = new URL(adresse)
  assert(
    ['localhost', '127.0.0.1'].includes(pg.hostname) && pg.pathname === '/cloison_audit_test',
    'Base locale jetable cloison_audit_test obligatoire',
  )
  assert(['localhost', '127.0.0.1'].includes(http.hostname), 'API de test locale obligatoire')
  const db = new Client({ connectionString: connexion })
  await db.connect()
  try {
    if (process.argv.includes('--preparer')) await preparerBase(db)
    else {
      await verifierPostgrest(db, adresse, secret)
      await verifierConcurrenceDepot(connexion)
      await db.query(
        'alter table public.membres_agence disable trigger membre_conserve_administrateur',
      )
      try {
        await assert.rejects(
          verifierConcurrenceAdministrateurs(connexion),
          /La seconde retrogradation doit attendre/,
        )
        console.log('OK : sabotage de la garde administrateur detecte')
      } finally {
        await db.query(
          'alter table public.membres_agence enable trigger membre_conserve_administrateur',
        )
      }
      await verifierConcurrenceAdministrateurs(connexion)
      console.log('OK : dernier administrateur preserve sur deux connexions et deux isolations')
      await db.query('begin')
      try {
        await db.query(
          readFileSync(resolve('supabase/essais/complements-documentaires.sql'), 'utf8'),
        )
      } finally {
        await db.query('rollback')
      }
      console.log('OK : complements, examen et refus locataire verifies sur PostgreSQL natif')
      await verifierConcurrencePaiements(connexion)
      console.log('OK : credit financier unique et sabotage verifies sur deux connexions')
      await verifierDiagnosticPaiement(db, connexion)
      await verifierDecisionsPaiements(db, connexion)
      await verifierConcurrenceOcr(db, connexion)
      await verifierConcurrenceConnecteurs(db, connexion)
      const ocr = spawnSync(process.execPath, ['scripts/verifier-navigateur-ocr.mjs'], {
        stdio: 'inherit',
        timeout: 120000,
      })
      assert.equal(ocr.status, 0, 'Parcours navigateur OCR refuse')
    }
  } finally {
    await db.end()
  }
}
