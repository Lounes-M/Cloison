import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { Client } from 'pg'
import { mkdtemp, realpath, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixtureCollecteDroits } from './fixture-collecte-droits.mjs'
import { collecterPiecesDroits } from '../lib/droits/pieces.ts'
import { sceller } from '../lib/coffre/enveloppe.ts'
import { scellerAvecTrousseau } from '../lib/coffre/rotation-format.ts'
import { ecrirePiecesDroits } from './collecter-pieces-droits.mjs'

export async function verifierPiecesDroits(db, connexion) {
  assert.equal((await db.query('select current_database() nom')).rows[0].nom, 'cloison_audit_test')
  assert(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(db.connection.stream.remoteAddress))
  const url = new URL(connexion)
  assert(
    ['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/cloison_audit_test',
  )
  const f = await fixtureCollecteDroits(db)
  const trousseau = { historique: randomBytes(32), active: randomBytes(32), lecture: [] }
  const dek = randomBytes(32),
    contenu = Buffer.from('%PDF-1.7\nDocument fictif')
  await db.query('insert into cles_dossier(dossier_id,cle_scellee) values($1,$2)', [
    f.garant,
    scellerAvecTrousseau(dek, trousseau),
  ])
  const p = (
    await db.query('update pieces set taille_octets=$1 where dossier_id=$2 returning id', [
      contenu.length,
      f.garant,
    ])
  ).rows[0]
  const decision = {
    ...f.decision,
    revision: randomUUID(),
    pieces: [{ id: p.id, dossier: f.garant }],
  }
  const brut = JSON.stringify(decision)
  await db.query(
    `insert into suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
    select $1,demande,operation,operateur,nature,'en_cours',recu_le,repondre_avant,effacer_le,$2 from suivi_demandes_droits where operation=$3`,
    [decision.revision, createHash('sha256').update(brut).digest('hex'), f.decision.revision],
  )
  const telecharger = async () => sceller(contenu, dek)
  const r = await collecterPiecesDroits(db, brut, trousseau, telecharger)
  assert.deepEqual(r.fichiers.get('piece-0001.pdf'), contenu)
  for (const b of r.fichiers.values()) b.fill(0)
  const repertoire = await mkdtemp(join(await realpath(tmpdir()), 'cloison-pieces-natives-'))
  try {
    const entree = join(repertoire, 'decision.json'),
      sortie = join(repertoire, 'copies')
    await writeFile(entree, brut, { mode: 0o600 })
    await ecrirePiecesDroits(entree, sortie, () =>
      collecterPiecesDroits(db, brut, trousseau, telecharger),
    )
    assert.deepEqual(await readFile(join(sortie, 'piece-0001.pdf')), contenu)
  } finally {
    await rm(repertoire, { recursive: true, force: true })
  }
  const autre = new Client({
    connectionString: connexion,
    query_timeout: 6000,
    statement_timeout: 5000,
  })
  try {
    await autre.connect()
    await assert.rejects(
      collecterPiecesDroits(db, brut, trousseau, async () => {
        await autre.query(
          `insert into suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
        select $1,demande,operation,operateur,nature,'identite_a_verifier',recu_le,repondre_avant,effacer_le,preuve_sha256
        from suivi_demandes_droits where operation=$2`,
          [randomUUID(), decision.revision],
        )
        return telecharger()
      }),
      /Collecte des pieces refusee/,
    )
  } finally {
    await autre.end()
  }
  console.log(
    'OK : pieces chiffrees, rotation, fichiers prives et decision modifiee par une seconde connexion',
  )
}
