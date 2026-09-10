import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
// Appel exclusivement depuis le harnais PostgreSQL local deja controle.
export async function verifierConcurrenceOcr(db, connexion) {
  await db.query('begin')
  try {
    await db.query(readFileSync('supabase/essais/lecture-ocr.sql', 'utf8'))
  } finally {
    await db.query('rollback')
  }
  const source = readFileSync('supabase/essais/lecture-ocr.sql', 'utf8').split(
    'set local role authenticated;',
  )[0]
  await db.query('begin')
  await db.query(source)
  const {
    rows: [fixture],
  } = await db.query(
    "select current_setting('cloison.ocr_piece') piece,current_setting('cloison.ocr_membre') membre",
  )
  await db.query('commit')
  const clients = Array.from({ length: 6 }, () => new Client({ connectionString: connexion }))
  try {
    await Promise.all(clients.map((c) => c.connect()))
    const resultats = await Promise.all(
      clients.map(async (c) => {
        await c.query('begin; set local role authenticated')
        await c.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ role: 'authenticated', sub: fixture.membre, aal: 'aal2' }),
        ])
        const {
          rows: [r],
        } = await c.query('select reserver_lecture_ocr($1) ok', [fixture.piece])
        await c.query('commit')
        return r.ok
      }),
    )
    assert.equal(resultats.filter(Boolean).length, 5, 'Quota OCR concurrent depasse')
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from journal_acces where piece_id=$1 and action='ocr_demande'",
          [fixture.piece],
        )
      ).rows[0].n,
      5,
    )
    console.log('OK : roles OCR, journal et six demandes concurrentes verifies')
  } finally {
    await Promise.all(clients.map((c) => c.end()))
  }
}
