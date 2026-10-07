import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai } from './base'
let db: PGlite, id: string, demande: string, revision: string
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  id = randomUUID()
  demande = randomUUID()
  revision = randomUUID()
  const debut = randomUUID()
  await db.query(
    `insert into suivi_demandes_droits(operation,demande,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256) values($1,$2,gen_random_uuid(),'acces','recue',now()-interval '1 day',now()+interval '1 day',now()+interval '5 days',repeat('a',64))`,
    [debut, demande],
  )
  await db.query(
    `insert into suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256) select $1,demande,operation,operateur,nature,'en_cours',recu_le,repondre_avant,effacer_le,preuve_sha256 from suivi_demandes_droits where operation=$2`,
    [revision, debut],
  )
  await db.query(
    `insert into remises_droits(id,demande,revision,approbation_sha256,jeton_sha256,preuve_acces_sha256,archive_sha256,taille,manifeste,expire_le,disponible) values($1,$2,$3,repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),100,jsonb_build_object('demande',($2::uuid)::text,'revision',($3::uuid)::text,'decisionSha256',repeat('a',64)),now()+interval '1 hour',true)`,
    [id, demande, revision],
  )
  await db.query("insert into storage.objects(bucket_id,name) values('exports-droits',$1)", [id])
})
afterEach(async () => {
  await db.exec('rollback;reset role')
})
async function autoriser(jeton = 'b'.repeat(64), preuve = 'c'.repeat(64), recu = false) {
  await db.exec('set local role serveur')
  return (
    await db.query<{ accord: { id: string; recu: boolean } | null }>(
      'select autoriser_remise_droits($1,$2,$3,$4) accord',
      [id, jeton, preuve, recu],
    )
  ).rows[0]!.accord
}
test('autorise les deux preuves et enregistre une confirmation declarative stable', async () => {
  expect((await autoriser())?.id).toBe(id)
  expect((await autoriser(undefined, undefined, true))?.recu).toBe(true)
  await db.exec('reset role')
  const avant = (await db.query('select recu_le from remises_droits where id=$1', [id])).rows[0]
  await autoriser(undefined, undefined, true)
  await db.exec('reset role')
  expect((await db.query('select recu_le from remises_droits where id=$1', [id])).rows[0]).toEqual(
    avant,
  )
})
test.each(['jeton', 'preuve', 'id'])(
  'refuse un mauvais %s sans consommer le compteur du destinataire',
  async (cas) => {
    const original = id
    if (cas === 'id') id = randomUUID()
    expect(
      await autoriser(
        cas === 'jeton' ? 'e'.repeat(64) : undefined,
        cas === 'preuve' ? 'f'.repeat(64) : undefined,
      ),
    ).toBeNull()
    await db.exec('reset role')
    expect(
      (
        await db.query<{ acces: number }>('select acces from remises_droits where id=$1', [
          original,
        ])
      ).rows[0]!.acces,
    ).toBe(0)
  },
)
test.each(['revoquee', 'expiree', 'purgee', 'preparation', 'nouvelle_revision', 'registre_absent'])(
  'refuse la remise %s',
  async (cas) => {
    if (cas === 'revoquee')
      await db.query('update remises_droits set revoque_le=now() where id=$1', [id])
    if (cas === 'expiree')
      await db.query(
        "update remises_droits set cree_le=now()-interval '2 hours',expire_le=now()-interval '1 hour' where id=$1",
        [id],
      )
    if (cas === 'purgee')
      await db.query('update remises_droits set purge_le=now() where id=$1', [id])
    if (cas === 'preparation')
      await db.query('update remises_droits set disponible=false where id=$1', [id])
    if (cas === 'registre_absent') {
      await db.exec("set local cloison.purge_droits='active'")
      await db.query('delete from suivi_demandes_droits where demande=$1', [demande])
    }
    if (cas === 'nouvelle_revision')
      await db.query(
        `insert into suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256) select gen_random_uuid(),demande,operation,operateur,nature,'repondu',recu_le,repondre_avant,effacer_le,preuve_sha256 from suivi_demandes_droits where operation=$1`,
        [revision],
      )
    expect(await autoriser()).toBeNull()
  },
)
test('borne a trente autorisations, y compris les confirmations', async () => {
  for (let n = 0; n < 30; n++) expect(await autoriser()).not.toBeNull()
  expect(await autoriser()).toBeNull()
})
test.each([
  'anon',
  'authenticated',
  'porteur_lien',
  'serveur',
  'depot_piece',
  'archive_signature',
  'service_role',
])('le role %s ne peut creer ni lire le registre', async (role) => {
  await db.exec(`set local role ${role};savepoint controle`)
  for (const sql of [
    'select * from remises_droits',
    'delete from remises_droits',
    'update remises_droits set disponible=true',
  ]) {
    await expect(db.query(sql)).rejects.toThrow(/permission denied/)
    await db.exec('rollback to controle')
  }
  if (role !== 'serveur')
    await expect(
      db.query('select autoriser_remise_droits($1,$2,$3,false)', [
        id,
        'b'.repeat(64),
        'c'.repeat(64),
      ]),
    ).rejects.toThrow(/permission denied/)
})
test('ne purge pas une remise active et acquitte seulement apres disparition des octets', async () => {
  await db.exec('set local role serveur')
  expect((await db.query('select remises_droits_a_purger()')).rows).toEqual([])
  expect(
    (await db.query("delete from storage.objects where bucket_id='exports-droits' returning name"))
      .rows,
  ).toEqual([])
  await db.exec('reset role')
  await db.query('update remises_droits set revoque_le=now() where id=$1', [id])
  await db.exec('set local role serveur')
  expect((await db.query('select remises_droits_a_purger() chemin')).rows).toEqual([{ chemin: id }])
  expect((await db.query('select acquitter_remise_droits($1) ok', [id])).rows).toEqual([
    { ok: false },
  ])
  expect(
    (await db.query("delete from storage.objects where bucket_id='exports-droits' returning name"))
      .rows,
  ).toEqual([{ name: id }])
  expect((await db.query('select acquitter_remise_droits($1) ok', [id])).rows).toEqual([
    { ok: true },
  ])
  expect((await db.query('select remises_droits_a_purger()')).rows).toEqual([])
  await db.exec('reset role')
  expect((await db.query('select id from remises_droits where purge_le is not null')).rows).toEqual(
    [{ id }],
  )
})
test('reprend les objets orphelins anciens et laisse un televersement recent tranquille', async () => {
  const ancien = randomUUID(),
    recent = randomUUID()
  await db.query(
    "insert into storage.objects(bucket_id,name,created_at) values('exports-droits',$1,now()-interval '16 minutes'),('exports-droits',$2,now())",
    [ancien, recent],
  )
  await db.exec('set local role serveur')
  expect((await db.query('select remises_droits_a_purger() chemin')).rows).toEqual([
    { chemin: ancien },
  ])
})
