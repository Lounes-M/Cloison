import { beforeAll, beforeEach, afterAll, afterEach, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire } from './base'
let db: PGlite, dossier: string, admin: string, agence: string, premier: string, second: string
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  await db.exec(
    readFileSync('supabase/essais/lecture-ocr.sql', 'utf8').split(
      'set local role authenticated;',
    )[0]!,
  )
  const r = (
    await db.query<{ d: string; u: string; a: string }>(
      "select current_setting('cloison.ocr_dossier') d,current_setting('cloison.ocr_membre') u,(select agence_id from dossiers where id=current_setting('cloison.ocr_dossier')::uuid) a",
    )
  ).rows[0]!
  dossier = r.d
  admin = r.u
  agence = r.a
  premier = randomUUID()
  second = randomUUID()
  for (const u of [premier, second]) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) select $1::uuid,$1::uuid::text||'@'||domaine,now() from agences where id=$2",
      [u, agence],
    )
    await db.query(
      "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'membre')",
      [agence, u],
    )
  }
  // Une date ne fournit pas un ordre d'insertion. Dates egales et UUID
  // decroissants rendent cette hypothese fausse a chaque execution.
  // Ces defaults de fixture disparaissent avec le ROLLBACK du test.
  await db.exec(`
    create temporary sequence historique_ids;
    alter table historique_responsables alter column quand
      set default '2026-01-01T00:00:00Z'::timestamptz;
    alter table historique_responsables alter column id
      set default (lpad((10000-nextval('pg_temp.historique_ids'))::text,32,'0')::uuid);
  `)
  await devenir(db, 'authenticated', admin)
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})
async function affecter(m: string | null = premier, r: string | null = null, d = dossier) {
  return (await db.query<{ r: string | null }>('select affecter_dossier($1,$2,$3) r', [d, m, r]))
    .rows[0]!.r
}
async function lire(d = dossier) {
  return (
    await db.query<{
      id: string
      quand: string
      precedent: string | null
      suivant: string | null
      auteur: string | null
      precedent_email: string | null
      suivant_email: string | null
      auteur_email: string | null
    }>('select * from historique_responsables_du_dossier($1)', [d])
  ).rows
}
test('la fixture de deploiement verifie roles, suppression Auth et retention', async () => {
  await redevenirProprietaire(db)
  await db.exec(readFileSync('supabase/essais/historique-responsables.sql', 'utf8'))
})
test('un membre confirme d une autre agence ne lit pas cet historique', async () => {
  await affecter()
  await redevenirProprietaire(db)
  const autreAgence = randomUUID(),
    autreUser = randomUUID(),
    domaine = `autre-${autreAgence}.invalid`
  await db.query("insert into agences(id,nom,domaine) values($1,'Autre agence fictive',$2)", [
    autreAgence,
    domaine,
  ])
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [
    autreUser,
    `admin@${domaine}`,
  ])
  await db.query(
    "insert into membres_agence(agence_id,utilisateur_id,role) values($1,$2,'admin')",
    [autreAgence, autreUser],
  )
  await devenir(db, 'authenticated', autreUser)
  expect((await db.query<{ id: string }>('select agence_courante() id')).rows[0]!.id).toBe(
    autreAgence,
  )
  expect(await lire()).toEqual([])
})
test('le role agence ne lit rien meme avec un grant accidentel sur la table', async () => {
  await affecter()
  await redevenirProprietaire(db)
  await db.exec('grant select on historique_responsables to authenticated')
  await devenir(db, 'authenticated', admin)
  expect((await db.query('select * from historique_responsables')).rows).toEqual([])
})
test('une modification de metadonnees ne cree pas une fausse affectation', async () => {
  await affecter()
  await redevenirProprietaire(db)
  await expect(
    db.query('update affectations_dossiers set attribue_par=null where dossier_id=$1', [dossier]),
  ).resolves.toBeDefined()
  await devenir(db, 'authenticated', admin)
  expect(await lire()).toHaveLength(1)
})
test('un auteur technique hors agence n expose pas son identifiant dans le suivi', async () => {
  await affecter()
  await redevenirProprietaire(db)
  const auteurExterne = randomUUID()
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'technique@externe.invalid',now())",
    [auteurExterne],
  )
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: auteurExterne, aal: 'aal2', role: 'authenticated' }),
  ])
  await db.query('update affectations_dossiers set membre_id=$1 where dossier_id=$2', [
    second,
    dossier,
  ])
  await devenir(db, 'authenticated', admin)
  const rows = await lire()
  expect(rows).toHaveLength(2)
  expect(rows.find((r) => r.suivant === second)?.auteur).toBeNull()
})
test.each(['non-confirme', 'autre-domaine'])(
  'une adresse devenue %s n est plus restituee',
  async (mode) => {
    await affecter()
    await redevenirProprietaire(db)
    await db.query(
      mode === 'non-confirme'
        ? 'update auth.users set email_confirmed_at=null where id=$1'
        : "update auth.users set email='autre@hors-agence.invalid' where id=$1",
      [premier],
    )
    await devenir(db, 'authenticated', admin)
    expect((await lire())[0]!.suivant_email).toBeNull()
  },
)
test('la purge ne touche pas un dossier encore valable', async () => {
  await affecter()
  await devenir(db, 'serveur')
  await expect(db.query('select purger_historique_responsables() n')).resolves.toMatchObject({
    rows: [{ n: 0 }],
  })
  await devenir(db, 'authenticated', admin)
  expect(await lire()).toHaveLength(1)
})
test.each(['anon', 'authenticated', 'porteur_lien', 'serveur', 'depot_piece', 'service_role'])(
  'le role %s ne falsifie pas l historique',
  async (role) => {
    await affecter()
    await db.exec(`set local role ${role}`)
    for (const sql of [
      'insert into historique_responsables(dossier_id,revision,suivant) values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid())',
      'update historique_responsables set auteur=null',
      'delete from historique_responsables',
    ]) {
      await db.exec('savepoint interdit')
      await expect(db.query(sql)).rejects.toThrow(/permission denied/)
      await db.exec('rollback to interdit')
    }
  },
)

test('les changements effectifs sont traces, pas les rejeux ni les conflits', async () => {
  const a = await affecter()
  await affecter(premier, a)
  await affecter(second, null)
  expect(await lire()).toEqual([
    expect.objectContaining({ precedent: null, suivant: premier, auteur: admin }),
  ])
  const b = await affecter(second, a)
  await affecter(null, b)
  const rows = await lire()
  expect(rows).toHaveLength(3)
  expect(rows.map((r) => [r.precedent, r.suivant])).toEqual(
    expect.arrayContaining([
      [second, null],
      [premier, second],
      [null, premier],
    ]),
  )
})
test.each(['anon', 'porteur_lien', 'serveur', 'depot_piece', 'service_role'])(
  'le role %s ne lit pas le suivi equipe',
  async (role) => {
    await affecter()
    await db.exec(`set local role ${role};savepoint interdit`)
    await expect(lire()).rejects.toThrow(/permission denied/)
    await db.exec('rollback to interdit')
    await expect(db.query('select * from historique_responsables')).rejects.toThrow(
      /permission denied/,
    )
  },
)
test('meme le collaborateur n accede pas a la table brute', async () => {
  await affecter()
  await expect(db.query('select * from historique_responsables')).rejects.toThrow(
    /permission denied/,
  )
})
test('un compte hors agence ou sans AAL2 ne recoit aucune ligne', async () => {
  await affecter()
  await devenir(db, 'authenticated', randomUUID())
  expect(await lire()).toEqual([])
  await devenir(db, 'authenticated', admin)
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ role: 'authenticated', sub: admin, aal: 'aal1' }),
  ])
  expect(await lire()).toEqual([])
})
test('une exclusion libere le dossier sans conserver l adresse de l ancien membre', async () => {
  await affecter()
  await redevenirProprietaire(db)
  await db.query('delete from membres_agence where utilisateur_id=$1', [premier])
  await devenir(db, 'authenticated', admin)
  const rows = await lire()
  expect(rows).toHaveLength(2)
  expect(rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ precedent: premier, suivant: null, precedent_email: null }),
      expect.objectContaining({ precedent: null, suivant: premier, suivant_email: null }),
    ]),
  )
})
test('la suppression Auth n est pas bloquee par l historique immuable', async () => {
  await affecter()
  await redevenirProprietaire(db)
  await db.query('delete from auth.users where id=$1', [premier])
  await devenir(db, 'authenticated', admin)
  const rows = await lire()
  expect(rows).toHaveLength(2)
  expect(rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ precedent: premier, suivant: null, precedent_email: null }),
      expect.objectContaining({ precedent: null, suivant: premier, suivant_email: null }),
    ]),
  )
})
test.each(['update', 'delete'])(
  'l administrateur technique ne fait pas de %s ordinaire',
  async (op) => {
    await affecter()
    await redevenirProprietaire(db)
    await expect(
      db.query(
        op === 'update'
          ? 'update historique_responsables set auteur=null'
          : 'delete from historique_responsables',
      ),
    ).rejects.toThrow('Historique des responsables immuable')
  },
)
test('un dossier expire devient invisible et son historique est detruit meme si signe', async () => {
  await affecter()
  await redevenirProprietaire(db)
  await db.query(
    "update dossiers set statut='signe',cree_le=now()-interval '4 months',expire_le=now()-interval '1 day' where id=$1",
    [dossier],
  )
  await devenir(db, 'authenticated', admin)
  expect(await lire()).toEqual([])
  await devenir(db, 'serveur')
  expect(
    (await db.query<{ n: number }>('select purger_historique_responsables() n')).rows[0]!.n,
  ).toBe(1)
  await redevenirProprietaire(db)
  expect((await db.query('select * from historique_responsables')).rows).toEqual([])
  expect((await db.query('select id from dossiers where id=$1', [dossier])).rows).toHaveLength(1)
})
test('la suppression du dossier emporte son historique', async () => {
  await affecter()
  await redevenirProprietaire(db)
  await db.query('delete from dossiers where id=$1', [dossier])
  expect((await db.query('select * from historique_responsables')).rows).toEqual([])
})
test('les dates priment sur les UUID dans l ordre de lecture', async () => {
  await redevenirProprietaire(db)
  const ids = [
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
  ]
  for (const [i, date] of [
    '2026-01-03T00:00:00Z',
    '2026-01-02T00:00:00Z',
    '2026-01-01T00:00:00Z',
  ].entries()) {
    await db.query(
      'insert into historique_responsables(id,dossier_id,revision,suivant,quand) values($1,$2,$3,$4,$5)',
      [ids[i], dossier, randomUUID(), premier, date],
    )
  }
  await devenir(db, 'authenticated', admin)
  expect((await lire()).map((r) => r.id)).toEqual(ids)
})

test('une page bornee conserve tous les changements de meme date a la frontiere du curseur', async () => {
  let r = await affecter()
  for (let i = 0; i < 54; i++) r = await affecter(i % 2 === 0 ? second : premier, r)
  const a = await lire()
  expect(a).toHaveLength(51)
  expect(new Set(a.map((r) => r.quand)).size).toBe(1)
  const borne = a[49]!
  const b = (
    await db.query<{ id: string }>('select * from historique_responsables_du_dossier($1,$2,$3)', [
      dossier,
      borne.quand,
      borne.id,
    ])
  ).rows
  expect(b).toHaveLength(5)
  expect(b.some((l) => a.slice(0, 50).some((x) => x.id === l.id))).toBe(false)
  expect([...a.slice(0, 50), ...b].map((l) => l.id)).toEqual(
    Array.from(
      { length: 55 },
      (_, i) => `00000000-0000-0000-0000-${String(9999 - i).padStart(12, '0')}`,
    ),
  )
})
test.each(['anon', 'authenticated', 'porteur_lien', 'depot_piece', 'service_role'])(
  'le role %s ne declenche pas la purge',
  async (role) => {
    await db.exec(`set local role ${role}`)
    await expect(db.query('select purger_historique_responsables()')).rejects.toThrow(
      /permission denied/,
    )
  },
)
test('la purge est bornee et reprend les lignes restantes', async () => {
  let r = await affecter()
  for (let i = 0; i < 1000; i++) r = await affecter(i % 2 === 0 ? second : premier, r)
  await redevenirProprietaire(db)
  await db.query(
    "update dossiers set cree_le=now()-interval '4 months',expire_le=now()-interval '1 day' where id=$1",
    [dossier],
  )
  await devenir(db, 'serveur')
  expect(
    (await db.query<{ n: number }>('select purger_historique_responsables() n')).rows[0]!.n,
  ).toBe(1000)
  expect(
    (await db.query<{ n: number }>('select purger_historique_responsables() n')).rows[0]!.n,
  ).toBe(1)
})
