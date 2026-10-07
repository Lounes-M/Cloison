import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Client } from 'pg'
import { nouvelleRemise, publierRemise, examinerRemise } from './remise-droits.mjs'
import { preuveRemise, ouvrirRemise } from '../lib/droits/remise-format.ts'

/** PostgreSQL natif et chiffrement reels ; Storage simule, sans donnee personnelle. */
export async function verifierRemiseDroits(db, connexion, brut, archive, cle) {
  const adresse = new URL(connexion)
  assert(
    ['localhost', '127.0.0.1'].includes(adresse.hostname) &&
      adresse.pathname === '/cloison_audit_test',
  )
  const r = nouvelleRemise(brut, archive),
    objets = new Map()
  let panne = true
  const stockage = async (id, b) => {
    objets.set(id, Buffer.from(b))
    if (panne) {
      panne = false
      throw new Error('Reponse de depot perdue')
    }
  }
  const verifier = async () => {}
  await assert.rejects(
    publierRemise(db, stockage, brut, archive, cle, r, verifier),
    /Reponse de depot perdue/,
  )
  assert.equal((await examinerRemise(db, r.id)).disponible, false)
  await publierRemise(db, stockage, brut, archive, cle, r, verifier)
  await publierRemise(db, stockage, brut, archive, cle, r, verifier)
  assert.equal(objets.size, 1)
  const hash = (s) => createHash('sha256').update(s).digest('hex')
  const preuve = await preuveRemise(Uint8Array.from(cle), r.id)
  const parametres = [r.id, hash(r.jeton), hash(preuve)]
  await db.query('set role serveur')
  try {
    const droit = (
      await db.query('select autoriser_remise_droits($1,$2,$3,false) droit', parametres)
    ).rows[0].droit
    assert.equal(droit.id, r.id)
    const fichiers = await ouvrirRemise(
      Uint8Array.from(objets.get(r.id)),
      Uint8Array.from(cle),
      droit,
    )
    assert(fichiers.size > 0)
    for (const b of fichiers.values()) b.fill(0)
    assert.equal(
      (await db.query('select autoriser_remise_droits($1,$2,$3,true) droit', parametres)).rows[0]
        .droit.recu,
      true,
    )
  } finally {
    await db.query('reset role')
  }
  assert((await examinerRemise(db, r.id)).recu_le)
  const verrou = new Client({ connectionString: connexion })
  await verrou.connect()
  try {
    await verrou.query('begin')
    await verrou.query('select pg_advisory_xact_lock(hashtextextended($1,5353))', [
      JSON.parse(brut).demande,
    ])
    await verrou.query('update remises_droits set revoque_le=clock_timestamp() where id=$1', [r.id])
    let termine = false
    const tentative = db
      .query('select autoriser_remise_droits($1,$2,$3,false) droit', parametres)
      .finally(() => {
        termine = true
      })
    await new Promise((resolve) => setTimeout(resolve, 150))
    assert.equal(termine, false, 'La lecture doit attendre la decision concurrente')
    await verrou.query('commit')
    assert.equal(
      (await tentative).rows[0].droit,
      null,
      'La revocation concurrente doit interdire la remise',
    )
    await assert.rejects(publierRemise(db, stockage, brut, archive, cle, r, verifier), /revoquee/)
  } finally {
    await verrou.query('rollback').catch(() => {})
    await verrou.end()
  }
  console.log('OK : remise chiffree, reprise, reception et revocation concurrente verifiees')
}
