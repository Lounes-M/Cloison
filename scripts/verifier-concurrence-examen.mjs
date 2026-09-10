import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

export async function verifierConcurrenceExamen(db, connexion) {
  assert.equal((await db.query('select current_database() nom')).rows[0].nom, 'cloison_audit_test')
  assert(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(db.connection.stream.remoteAddress))
  const fixture = readFileSync('supabase/essais/examen-documentaire.sql', 'utf8')
  await db.query('begin')
  try {
    await db.query(fixture)
  } finally {
    await db.query('rollback')
  }
  await db.query('begin')
  await db.query(fixture.split('set local role authenticated;')[0])
  const {
    rows: [f],
  } = await db.query(
    "select current_setting('cloison.examen_dossier') dossier,current_setting('cloison.examen_piece') piece,current_setting('cloison.examen_membre') membre",
  )
  await db.query('commit')
  const definition = (
    await db.query(
      "select pg_get_functiondef('public.enregistrer_examen_documentaire(uuid,uuid,text,uuid)'::regprocedure) texte",
    )
  ).rows[0].texte
  const garde = 'if derniere is distinct from revision_attendue then return null;end if;'
  assert(definition.includes(garde))
  async function deuxExamens() {
    await db.query('delete from examens_documentaires where piece_id=$1', [f.piece])
    const clients = [
      new Client({ connectionString: connexion }),
      new Client({ connectionString: connexion }),
    ]
    try {
      await Promise.all(clients.map((c) => c.connect()))
      return (
        await Promise.all(
          clients.map(async (c, i) => {
            await c.query('set role authenticated')
            await c.query("select set_config('request.jwt.claims',$1,false)", [
              JSON.stringify({ role: 'authenticated', sub: f.membre, aal: 'aal2' }),
            ])
            return (
              await c.query('select enregistrer_examen_documentaire($1,$2,$3,null) id', [
                f.dossier,
                f.piece,
                i ? 'a_revoir' : 'examine',
              ])
            ).rows[0].id
          }),
        )
      ).filter(Boolean)
    } finally {
      await Promise.all(clients.map((c) => c.end()))
    }
  }
  assert.equal((await deuxExamens()).length, 1, 'Examen recent ecrase')
  try {
    await db.query(definition.replace(garde, ''))
    const sabote = await deuxExamens()
    assert.equal(sabote.length, 2, 'Contre-preuve examen non reproduite')
    assert.throws(() => assert.equal(sabote.length, 1, 'Examen recent ecrase'), {
      code: 'ERR_ASSERTION',
    })
  } finally {
    await db.query(definition)
  }
  assert.equal((await deuxExamens()).length, 1, 'Revision examen non restauree')
  console.log('OK : examen humain, roles reels, conflit concurrent, contre-preuve et restauration')
}
