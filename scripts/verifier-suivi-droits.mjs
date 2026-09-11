import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { Client } from 'pg'
import { consignerSuiviDroits } from './consigner-suivi-droits.mjs'
import { examinerSuiviDroits } from './examiner-suivi-droits.mjs'

async function verifierPurgeConcurrente(db, a, b, modele) {
  const v = {
    ...modele,
    operation: randomUUID(),
    demande: randomUUID(),
    repondreAvant: new Date().toISOString(),
    effacerLe: new Date(Date.now() + 1500).toISOString(),
  }
  await consignerSuiviDroits(db, v)
  const pid = (await b.query('select pg_backend_pid() pid')).rows[0].pid
  let purge
  try {
    await a.query('begin')
    await a.query(
      `insert into public.suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
   values($1,$2,$3,$4,'acces','en_cours',$5,$6,$7,$8)`,
      [
        randomUUID(),
        v.demande,
        v.operation,
        v.operateur,
        v.recuLe,
        v.repondreAvant,
        modele.effacerLe,
        'b'.repeat(64),
      ],
    )
    await db.query('select pg_sleep(1.6)')
    purge = b.query('select public.purger_suivis_droits()')
    let attend = false
    for (let i = 0; i < 100; i++) {
      if (
        (
          await db.query("select wait_event='advisory' attend from pg_stat_activity where pid=$1", [
            pid,
          ])
        ).rows[0]?.attend
      ) {
        attend = true
        break
      }
      await db.query('select pg_sleep(0.01)')
    }
    assert.equal(attend, true, 'La purge doit attendre la revision en cours')
    await a.query('commit')
    await purge
    assert.equal(
      (
        await db.query(
          'select count(*)::integer n from public.suivi_demandes_droits where demande=$1',
          [v.demande],
        )
      ).rows[0].n,
      2,
      'La purge doit relire la nouvelle echeance apres le verrou',
    )
  } finally {
    await a.query('rollback')
    await purge?.catch(() => {})
    await db.query('begin')
    try {
      await db.query("select set_config('cloison.purge_droits','active',true)")
      await db.query('delete from public.suivi_demandes_droits where demande=$1', [v.demande])
      await db.query('commit')
    } catch (erreur) {
      await db.query('rollback')
      throw erreur
    }
  }
}

// Exclusivement sur la base jetable controlee par test-postgrest.
export async function verifierSuiviDroits(db, connexion) {
  await db.query('begin')
  try {
    await db.query(readFileSync('supabase/essais/suivi-droits.sql', 'utf8'))
  } finally {
    await db.query('rollback')
  }
  const v = {
    connexion,
    operation: randomUUID(),
    demande: randomUUID(),
    precedente: null,
    operateur: randomUUID(),
    nature: 'acces',
    etat: 'recue',
    recuLe: new Date(Date.now() - 86400000).toISOString(),
    repondreAvant: new Date(Date.now() + 86400000).toISOString(),
    effacerLe: new Date(Date.now() + 86400000 * 2).toISOString(),
    preuve: 'Preuve privee exclusivement fictive',
  }
  const a = new Client({ connectionString: connexion }),
    b = new Client({ connectionString: connexion })
  try {
    await a.connect()
    await b.connect()
    const rejoues = await Promise.all([consignerSuiviDroits(a, v), consignerSuiviDroits(b, v)])
    assert.deepEqual(rejoues.map((r) => r.cree).sort(), [false, true])
    const suite = { ...v, operation: randomUUID(), precedente: v.operation, etat: 'en_cours' }
    const conflits = await Promise.allSettled([
      consignerSuiviDroits(a, suite),
      consignerSuiviDroits(b, { ...suite, operation: randomUUID(), etat: 'identite_a_verifier' }),
    ])
    assert.equal(conflits.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal(conflits.filter((r) => r.status === 'rejected').length, 1)
    assert.equal((await examinerSuiviDroits(db, { demande: v.demande })).etapes.length, 2)
    const cli = spawnSync(process.execPath, ['scripts/consigner-suivi-droits.mjs'], {
      input: JSON.stringify(v),
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
      env: { PATH: process.env.PATH },
    })
    assert.equal(cli.status, 0)
    assert.equal(cli.stdout.trim(), 'Etape de suivi consignée.')
    assert.equal(cli.stderr, '')
    const lecture = spawnSync(process.execPath, ['scripts/examiner-suivi-droits.mjs'], {
      input: JSON.stringify({ connexion, selection: { demande: v.demande } }),
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
      env: { PATH: process.env.PATH },
    })
    assert.equal(lecture.status, 0)
    assert.equal(JSON.parse(lecture.stdout).etapes.length, 2)
    assert.equal(lecture.stdout.includes(v.preuve), false)
    assert.equal(lecture.stdout.includes(connexion), false)
    await verifierPurgeConcurrente(db, a, b, v)
    const original = (
      await db.query(
        "select pg_get_functiondef('public.purger_suivis_droits()'::regprocedure) definition",
      )
    ).rows[0].definition
    const sabote = original.replace(
      'where n.precedente=s.operation)) then',
      'where n.precedente=s.operation)) or true then',
    )
    assert.notEqual(sabote, original, 'Cible de contre-preuve absente')
    try {
      await db.query(sabote)
      await assert.rejects(
        verifierPurgeConcurrente(db, a, b, v),
        (erreur) =>
          erreur instanceof assert.AssertionError &&
          erreur.message.includes('relire la nouvelle echeance'),
      )
      console.log('ROUGE observe : sans relecture, une retention prolongee est perdue')
    } finally {
      await db.query(original)
    }
    await verifierPurgeConcurrente(db, a, b, v)
    console.log('RESTAURE : verrou et relecture protegent la retention concurrente')
    console.log('OK : suivi prive, roles reels, revisions concurrentes, rejeu et lecture CLI')
  } finally {
    await a.end().catch(() => {})
    await b.end().catch(() => {})
    await db.query('begin')
    try {
      await db.query("select set_config('cloison.purge_droits','active',true)")
      await db.query('delete from public.suivi_demandes_droits where demande=$1', [v.demande])
      await db.query('commit')
    } catch (erreur) {
      await db.query('rollback')
      throw erreur
    }
  }
}
