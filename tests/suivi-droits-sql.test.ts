import { beforeAll, afterAll, beforeEach, afterEach, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire } from './base'
let db: PGlite, demande: string, operateur: string
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  demande = randomUUID()
  operateur = randomUUID()
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})
test('les droits reels et la retention passent la fixture de deploiement', async () => {
  await db.exec(readFileSync('supabase/essais/suivi-droits.sql', 'utf8'))
})
test('la RLS cache les lignes meme apres un grant accidentel', async () => {
  await etape()
  await db.exec(
    'grant select on suivi_demandes_droits to authenticated;set local role authenticated',
  )
  expect((await db.query('select * from suivi_demandes_droits')).rows).toEqual([])
})
test('le catalogue garde la meme empreinte en UTC et en Europe Paris', async () => {
  await db.exec("set local timezone='UTC'")
  const utc = (await db.query('select public.empreinte_schema() empreinte')).rows[0]
  await db.exec("set local timezone='Europe/Paris'")
  expect((await db.query('select public.empreinte_schema() empreinte')).rows[0]).toEqual(utc)
})
test('la borne de reception precedant 1970 est refusee meme avec un fuseau local', async () => {
  await db.exec("set local timezone='Europe/Paris'")
  await expect(
    etape('recue', null, randomUUID(), { recu: '1969-12-31T23:30:00Z' }),
  ).rejects.toThrow(/check constraint/)
})
async function etape(
  etat = 'recue',
  precedente: string | null = null,
  operation = randomUUID(),
  surcharge: Record<string, unknown> = {},
) {
  const v = {
    operation,
    demande,
    precedente,
    operateur,
    nature: 'acces',
    etat,
    recu: '2026-01-01T00:00:00Z',
    reponse: '2026-02-01T00:00:00Z',
    effacement: '2030-01-01T00:00:00Z',
    preuve: 'a'.repeat(64),
    ...surcharge,
  }
  await db.query(
    'insert into suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(operation) do nothing',
    [
      v.operation,
      v.demande,
      v.precedente,
      v.operateur,
      v.nature,
      v.etat,
      v.recu,
      v.reponse,
      v.effacement,
      v.preuve,
    ],
  )
  return operation
}
test.each(['anon', 'authenticated', 'porteur_lien', 'serveur', 'depot_piece', 'service_role'])(
  'le role %s ne lit ni ne modifie les demandes de droits',
  async (role) => {
    await etape()
    await db.exec(`set local role ${role}`)
    for (const sql of [
      'select * from suivi_demandes_droits',
      "update suivi_demandes_droits set etat='clos'",
      'delete from suivi_demandes_droits',
    ]) {
      await db.exec('savepoint refus')
      await expect(db.query(sql)).rejects.toThrow(/permission denied/)
      await db.exec('rollback to refus')
    }
    await expect(etape()).rejects.toThrow(/permission denied/)
  },
)
test('une operation identique est rejouable sans nouvel evenement', async () => {
  const op = await etape()
  await etape('recue', null, op)
  expect((await db.query('select * from suivi_demandes_droits')).rows).toHaveLength(1)
})
test.each(['etat', 'preuve', 'operateur', 'effacement'])(
  'un rejeu ne peut changer %s',
  async (champ) => {
    const op = await etape()
    const valeur =
      champ === 'etat'
        ? 'en_cours'
        : champ === 'preuve'
          ? 'b'.repeat(64)
          : champ === 'operateur'
            ? randomUUID()
            : '2031-01-01T00:00:00Z'
    await expect(etape('recue', null, op, { [champ]: valeur })).rejects.toThrow(
      'Operation administrative divergente',
    )
  },
)
test('une revision ancienne ne peut ecraser une nouvelle etape', async () => {
  const op = await etape()
  await etape('en_cours', op)
  await expect(etape('identite_a_verifier', op)).rejects.toThrow('Revision administrative obsolete')
})
test('une revision ne peut provenir d une autre demande', async () => {
  const op = await etape()
  await expect(etape('en_cours', op, randomUUID(), { demande: randomUUID() })).rejects.toThrow(
    'Revision administrative obsolete',
  )
})
test.each(['nature', 'recu'])('une suite ne modifie pas %s', async (champ) => {
  const op = await etape()
  await expect(
    etape('en_cours', op, randomUUID(), {
      [champ]: champ === 'nature' ? 'effacement' : '2026-01-02T00:00:00Z',
    }),
  ).rejects.toThrow('Reception administrative immuable')
})
test.each(['en_cours', 'repondu', 'clos'])('une premiere etape ne peut etre %s', async (etat) => {
  await expect(etape(etat)).rejects.toThrow('La premiere etape est une reception')
})
test('une demande sans reponse ne peut etre declaree close', async () => {
  const op = await etape()
  await expect(etape('clos', op)).rejects.toThrow('Transition administrative invalide')
})
test('une chaine close ne peut etre rouverte silencieusement', async () => {
  const a = await etape(),
    b = await etape('en_cours', a),
    c = await etape('repondu', b),
    d = await etape('clos', c)
  await expect(etape('en_cours', d)).rejects.toThrow('Transition administrative invalide')
})
test('les dates et le compte d inscription viennent de la base', async () => {
  const op = await etape()
  const r = (
    await db.query<{ compte: string; attendu: string; recent: boolean }>(
      'select compte_base compte,session_user attendu,inscrit_le>=transaction_timestamp() recent from suivi_demandes_droits where operation=$1',
      [op],
    )
  ).rows[0]!
  expect(r.compte).toBe(r.attendu)
  expect(r.recent).toBe(true)
})
test.each(['update', 'delete'])('meme l administrateur ne fait pas de %s ordinaire', async (op) => {
  await etape()
  await expect(
    db.query(
      op === 'update'
        ? "update suivi_demandes_droits set etat='en_cours'"
        : 'delete from suivi_demandes_droits',
    ),
  ).rejects.toThrow(
    op === 'update' ? 'Etape administrative immuable' : 'Suppression reservee a la retention',
  )
})
test.each([
  {
    recu: '2040-01-01T00:00:00Z',
    reponse: '2040-02-01T00:00:00Z',
    effacement: '2041-01-01T00:00:00Z',
  },
  { effacement: '2026-02-01T00:00:00Z' },
  { reponse: '2025-01-01T00:00:00Z' },
  { effacement: 'infinity' },
])('refuse des dates invalides %#', async (v) => {
  await expect(etape('recue', null, randomUUID(), v)).rejects.toThrow()
})
test('la purge respecte la derniere echeance de toute la demande', async () => {
  const op = await etape()
  await etape('en_cours', op, randomUUID(), { effacement: '2031-01-01T00:00:00Z' })
  // Fixture uniquement : vieillir une ancienne etape sans modifier la derniere.
  await db.exec('alter table suivi_demandes_droits disable trigger droits_etapes_immuables')
  await db.query(
    "update suivi_demandes_droits set effacer_le='2026-03-01T00:00:00Z' where operation=$1",
    [op],
  )
  await db.exec('alter table suivi_demandes_droits enable trigger droits_etapes_immuables')
  await devenir(db, 'serveur')
  expect((await db.query<{ n: number }>('select purger_suivis_droits() n')).rows[0]!.n).toBe(0)
  await redevenirProprietaire(db)
  expect((await db.query('select * from suivi_demandes_droits')).rows).toHaveLength(2)
})
test('la purge detruit une chaine arrivee a echeance et referme son autorisation locale', async () => {
  const op = await etape()
  await etape('repondu', op)
  await db.exec('alter table suivi_demandes_droits disable trigger droits_etapes_immuables')
  await db.query("update suivi_demandes_droits set effacer_le='2026-03-01T00:00:00Z'")
  await db.exec('alter table suivi_demandes_droits enable trigger droits_etapes_immuables')
  await devenir(db, 'serveur')
  expect((await db.query<{ n: number }>('select purger_suivis_droits() n')).rows[0]!.n).toBe(1)
  await redevenirProprietaire(db)
  expect((await db.query('select * from suivi_demandes_droits')).rows).toEqual([])
  expect(
    (await db.query<{ v: string }>("select current_setting('cloison.purge_droits',true) v"))
      .rows[0]!.v,
  ).not.toBe('active')
})

test.each(['anon', 'authenticated', 'porteur_lien', 'depot_piece', 'service_role'])(
  'le role %s ne peut declencher la retention',
  async (role) => {
    await db.exec(`set local role ${role}`)
    await expect(db.query('select public.purger_suivis_droits()')).rejects.toThrow(
      /permission denied/,
    )
  },
)
test('le compte et la date fournis ne peuvent falsifier l inscription', async () => {
  const op = randomUUID()
  await db.query(
    `insert into suivi_demandes_droits(operation,demande,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256,compte_base,inscrit_le) values($1,$2,$3,'acces','recue','2026-01-01','2026-02-01','2030-01-01',$4,'usurpation','2000-01-01')`,
    [op, demande, operateur, 'a'.repeat(64)],
  )
  const r = (
    await db.query<{ compte: string; attendu: string; recent: boolean }>(
      'select compte_base compte,session_user attendu,inscrit_le>=transaction_timestamp() recent from suivi_demandes_droits where operation=$1',
      [op],
    )
  ).rows[0]!
  expect(r.compte).toBe(r.attendu)
  expect(r.recent).toBe(true)
})
test('une chaine expiree ne peut etre prolongee', async () => {
  const op = await etape()
  await db.exec(
    "alter table suivi_demandes_droits disable trigger droits_etapes_immuables;update suivi_demandes_droits set effacer_le='2026-03-01T00:00:00Z';alter table suivi_demandes_droits enable trigger droits_etapes_immuables",
  )
  await expect(etape('en_cours', op)).rejects.toThrow('Suivi arrive a echeance')
})
test('la chaine est limitee a cent etapes, avec rejeu encore possible', async () => {
  let op = await etape(),
    precedente: string | null = null
  for (let i = 1; i < 100; i++) {
    precedente = op
    op = await etape('en_cours', op)
  }
  await etape('en_cours', precedente, op)
  expect((await db.query('select * from suivi_demandes_droits')).rows).toHaveLength(100)
  await expect(etape('en_cours', op)).rejects.toThrow('Historique administratif trop volumineux')
})
test('la maintenance efface au plus cent demandes et reprend le reliquat', async () => {
  for (let i = 0; i < 101; i++) await etape('recue', null, randomUUID(), { demande: randomUUID() })
  await db.exec(
    "alter table suivi_demandes_droits disable trigger droits_etapes_immuables;update suivi_demandes_droits set effacer_le='2026-03-01T00:00:00Z';alter table suivi_demandes_droits enable trigger droits_etapes_immuables",
  )
  await devenir(db, 'serveur')
  expect((await db.query<{ n: number }>('select purger_suivis_droits() n')).rows[0]!.n).toBe(100)
  expect((await db.query<{ n: number }>('select purger_suivis_droits() n')).rows[0]!.n).toBe(1)
  expect((await db.query<{ n: number }>('select purger_suivis_droits() n')).rows[0]!.n).toBe(0)
})
