import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { examinerPaiement } from './examiner-paiement.mjs'
import { diagnostiquerPaiement } from './diagnostic-paiement.mjs'
import { Client } from 'pg'

// Appele uniquement par le harnais qui exige la base locale jetable.
export async function verifierDiagnosticPaiement(db, connexion) {
  const dossier = '92345678-1234-4234-8234-123456789012'
  const destination = await mkdtemp(join(tmpdir(), 'cloison-diagnostic-natif-'))
  const concurrent = new Client({ connectionString: connexion })
  try {
    await concurrent.connect()
    await db.query(
      "insert into dossiers(id,email_locataire) values ($1,'diagnostic@audit.invalid')",
      [dossier],
    )
    await db.query(
      `select enregistrer_paiement_locataire('evt_diagnostic_natif','cs_diagnostic_natif',
      'pi_diagnostic_natif',$1,900,'eur','locataire-2026-09-04',now())`,
      [dossier],
    )
    await examinerPaiement({
      connexion,
      reference: 'cs_diagnostic_natif',
      destination: join(destination, 'rapport.json'),
    })
    const rapport = JSON.parse(await readFile(join(destination, 'rapport.json'), 'utf8'))
    assert.equal(JSON.parse(rapport.contenu).registre[0].marque, true)
    assert(!rapport.contenu.includes('diagnostic@audit.invalid'))
    const instantane = await diagnostiquerPaiement(
      {
        async query(sql, params) {
          const r = await db.query(sql, params)
          if (sql.startsWith('select transaction_timestamp'))
            await concurrent.query(`insert into evenements_paiements(id,nature,reference_objet,reference_paiement,montant_cents,devise,survenu_le)
            values ('evt_diagnostic_concurrent','remboursement','ch_diagnostic','pi_diagnostic_natif',100,'eur',now())`)
          return r
        },
      },
      'cs_diagnostic_natif',
    )
    assert.equal(
      instantane.evenements.length,
      1,
      'Le rapport conserve son instantane pendant une livraison concurrente',
    )
    assert.equal((await diagnostiquerPaiement(db, 'cs_diagnostic_natif')).evenements.length, 2)
    await assert.rejects(
      diagnostiquerPaiement(
        {
          async query(sql, params) {
            if (sql.startsWith('select transaction_timestamp'))
              await db.query(
                "delete from registre_paiements where reference_session='cs_diagnostic_natif'",
              )
            return db.query(sql, params)
          },
        },
        'cs_diagnostic_natif',
      ),
      /read-only/,
    )
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from registre_paiements where reference_session='cs_diagnostic_natif'",
        )
      ).rows[0].n,
      1,
    )
    console.log('OK : diagnostic administratif prive et lecture seule sur PostgreSQL natif')
  } finally {
    await concurrent.end().catch(() => {})
    await db.query(
      "delete from evenements_paiements where id in ('evt_diagnostic_natif','evt_diagnostic_concurrent')",
    )
    await db.query("delete from registre_paiements where reference_session='cs_diagnostic_natif'")
    await db.query('delete from dossiers where id=$1', [dossier])
    await rm(destination, { recursive: true, force: true })
  }
}
