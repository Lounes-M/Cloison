import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { verifierFileActes } from './verifier-file-actes.mjs'

export async function verifierConcurrenceActes(db, connexion) {
  assert.equal((await db.query('select current_database() nom')).rows[0].nom, 'cloison_audit_test')
  assert(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(db.connection.stream.remoteAddress))
  const precedents = (await db.query('select id,traitement_apres::text apres from actes_signature'))
    .rows
  const ids = [randomUUID(), randomUUID()]
  const clients = ids.map(
    () => new Client({ connectionString: connexion, connectionTimeoutMillis: 2000 }),
  )
  const connectes = new Set()
  try {
    await db.query("update actes_signature set traitement_apres='infinity'")
    await db.query('begin')
    await db.query(
      readFileSync('supabase/essais/lecture-ocr.sql', 'utf8').split(
        'set local role authenticated;',
      )[0],
    )
    const dossier = (await db.query("select current_setting('cloison.ocr_dossier') id")).rows[0].id
    await db.query("update dossiers set statut='transmis' where id=$1", [dossier])
    for (const [i, id] of ids.entries()) {
      await db.query(
        `insert into demandes_signature(id,dossier_id,source_dossier,environnement,empreinte_acte,reference_fournisseur,etat,cree_le)
        values($1,$2,$2,'sandbox',$3,gen_random_uuid(),'done',now()-($4 || ' days')::interval)`,
        [id, dossier, String(i).repeat(64), 2 - i],
      )
      await db.query(
        `insert into actes_signature(id,agence_id,modele,version_conditions,cle_scellee,contexte_chiffre,etape,expire_signature,conserver_jusqu_au)
        select $1,agence_id,'recette',1,decode(repeat('00',60),'hex'),decode(repeat('00',29),'hex'),'en_cours',now()+interval '2 days',now()+interval '1 year' from dossiers where id=$2`,
        [id, dossier],
      )
    }
    await db.query('commit')
    if (['linux', 'darwin'].includes(process.platform)) await verifierFileActes(db, connexion)
    const ouvertures = await Promise.allSettled(
      clients.map(async (c) => {
        await c.connect()
        connectes.add(c)
      }),
    )
    assert(
      ouvertures.every((r) => r.status === 'fulfilled'),
      'Connexions de recette indisponibles',
    )
    for (const c of clients)
      await c.query("begin; set local role serveur; set local statement_timeout='2s'")
    const premier = (await clients[0].query("select actes_a_traiter('sandbox') id")).rows
    assert.deepEqual(
      premier.map((r) => r.id),
      [ids[0]],
    )
    // Le premier verrou reste ouvert : le second processus doit avancer sans attendre.
    const second = (await clients[1].query("select actes_a_traiter('sandbox') id")).rows
    assert.deepEqual(
      second.map((r) => r.id),
      [ids[1]],
    )
    await Promise.all(clients.map((c) => c.query('commit')))
    await db.query('set role serveur')
    assert.deepEqual((await db.query("select actes_a_traiter('sandbox') id")).rows, [])
    console.log(
      'OK : deux traitements concurrents, verrous separes et reprises differees persistantes',
    )
  } finally {
    await Promise.all(
      clients.map(async (c) => {
        try {
          if (connectes.has(c)) await c.query('rollback')
        } catch {
          /* Connexion non ouverte ou deja fermee. */
        } finally {
          await c.end()
        }
      }),
    )
    await db.query('rollback; reset role')
    await db.query('delete from actes_signature where id=any($1::uuid[])', [ids])
    await db.query('delete from demandes_signature where id=any($1::uuid[])', [ids])
    for (const ancien of precedents)
      await db.query('update actes_signature set traitement_apres=$2::timestamptz where id=$1', [
        ancien.id,
        ancien.apres,
      ])
  }
}
