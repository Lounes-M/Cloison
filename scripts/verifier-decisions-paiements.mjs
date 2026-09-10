import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { consignerDecision } from './consigner-decision-paiement.mjs'
import { diagnostiquerPaiement } from './diagnostic-paiement.mjs'

// Appele apres verification de la base jetable et de la connexion locale.
export async function verifierDecisionsPaiements(db, connexion) {
  await db.query('begin')
  try {
    await db.query(readFileSync('supabase/essais/decisions-paiements.sql', 'utf8'))
  } finally {
    await db.query('rollback')
  }
  const dossier = randomUUID(),
    reference = `cs_decision_${dossier.replaceAll('-', '')}`
  await db.query("insert into dossiers(id,email_locataire) values($1,'decision@audit.invalid')", [
    dossier,
  ])
  await db.query('insert into sessions_paiement(dossier_id,session_ref) values($1,$2)', [
    dossier,
    reference,
  ])
  const contenu = JSON.stringify(await diagnostiquerPaiement(db, reference))
  const config = {
    connexion,
    operation: randomUUID(),
    operateur: randomUUID(),
    decision: 'a_examiner',
    rapport: {
      format: 'cloison-diagnostic-paiement-v1',
      contenu,
      sha256: createHash('sha256').update(contenu).digest('hex'),
    },
  }
  const premiere = new Client({ connectionString: connexion }),
    seconde = new Client({ connectionString: connexion })
  try {
    await premiere.connect()
    await seconde.connect()
    const rejoues = await Promise.all([
      consignerDecision(premiere, config),
      consignerDecision(seconde, config),
    ])
    assert.deepEqual(rejoues.map((r) => r.cree).sort(), [false, true])
    const concurrente = { ...config, operation: randomUUID() }
    const conflits = await Promise.allSettled([
      consignerDecision(premiere, concurrente),
      consignerDecision(seconde, { ...concurrente, decision: 'a_corriger' }),
    ])
    assert.equal(conflits.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal(conflits.filter((r) => r.status === 'rejected').length, 1)
    const cli = spawnSync(process.execPath, ['scripts/consigner-decision-paiement.mjs'], {
      input: JSON.stringify(config),
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
      env: { PATH: process.env.PATH },
    })
    assert.equal(cli.status, 0, 'Rejeu CLI refuse')
    assert.equal(cli.stdout.trim(), 'Decision consignée ; aucune alerte financiere acquittee.')
    assert.equal(cli.stderr, '')
    assert.equal(
      (
        await db.query(
          'select count(*)::integer n from decisions_paiements where reference_session=$1',
          [reference],
        )
      ).rows[0].n,
      2,
    )
    console.log(
      'OK : decisions privees, roles, immutabilite, deux connexions concurrentes et rejeu CLI',
    )
  } finally {
    await premiere.end().catch(() => {})
    await seconde.end().catch(() => {})
  }
}
