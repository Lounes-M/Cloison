import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai } from './base'
import { rescellerEnveloppes } from '../scripts/resceller-enveloppes.mjs'
import { nouvelleCle, sceller, ouvrir } from '@/lib/coffre/enveloppe'
import { ouvrirAvecTrousseau, scellerAvecTrousseau } from '@/lib/coffre/rotation-format'

let db: PGlite
const id = '10000000-0000-4000-8000-000000000001'
const historique = nouvelleCle(),
  active = nouvelleCle(),
  dek = nouvelleCle()
const cles = { historique, active, lecture: [] }
const ancienne = sceller(dek, historique)
const objet = sceller(Buffer.from('Document fictif intact'), dek)
const query = (sql: string, params: unknown[]) =>
  db.query<{ id: string; contenu?: Buffer | string }>(sql, params)
const base = { query }
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  await db.query(
    "insert into dossiers(id,email_locataire) values ($1,'rotation@example.invalid')",
    [id],
  )
  await db.query('insert into cles_dossier(dossier_id,cle_scellee) values ($1,$2)', [id, ancienne])
  await db.query('insert into courriels_sortants(id,contenu) values ($1,$2)', [
    id,
    sceller(Buffer.from('{"fictif":true}'), historique).toString('base64'),
  ])
})
afterEach(async () => {
  await db.exec('rollback')
})
async function cle() {
  return Buffer.from(
    (
      await db.query<{ cle_scellee: Buffer }>(
        'select cle_scellee from cles_dossier where dossier_id=$1',
        [id],
      )
    ).rows[0]!.cle_scellee,
  )
}
test('linventaire ne modifie aucune enveloppe', async () => {
  expect(await rescellerEnveloppes(base, cles)).toMatchObject({
    a_resceller: 2,
    rescellees: 0,
    echecs: 0,
  })
  expect(await cle()).toEqual(ancienne)
})
test('la reprise migre les deux enveloppes sans toucher la cle de donnees ni le document', async () => {
  expect(await rescellerEnveloppes(base, cles, { appliquer: true })).toMatchObject({
    rescellees: 2,
    echecs: 0,
  })
  const ouverte = ouvrirAvecTrousseau(await cle(), {
    historique: nouvelleCle(),
    active,
    lecture: [],
  })
  expect(ouverte).toEqual(dek)
  expect(ouvrir(objet, ouverte).toString()).toBe('Document fictif intact')
  const mail = (
    await db.query<{ contenu: string }>('select contenu from courriels_sortants where id=$1', [id])
  ).rows[0]!.contenu
  expect(ouvrirAvecTrousseau(Buffer.from(mail, 'base64'), cles).toString()).toBe('{"fictif":true}')
  expect(await rescellerEnveloppes(base, cles, { appliquer: true })).toMatchObject({
    examinees: 0,
    rescellees: 0,
  })
})
test('une suppression apres lecture ne peut recreer la cle ni le contenu dun courriel', async () => {
  const concurrent = {
    query: async (sql: string, params: unknown[]) => {
      if (sql.startsWith('update public.cles_dossier'))
        await db.query('delete from dossiers where id=$1', [id])
      if (sql.startsWith('update public.courriels_sortants'))
        await db.query('update courriels_sortants set contenu=null where id=$1', [id])
      return query(sql, params)
    },
  }
  expect(await rescellerEnveloppes(concurrent, cles, { appliquer: true })).toMatchObject({
    rescellees: 0,
    courses: 2,
  })
  expect((await db.query('select * from cles_dossier')).rows).toHaveLength(0)
  expect(
    (await db.query('select contenu from courriels_sortants where id=$1', [id])).rows[0],
  ).toEqual({ contenu: null })
})
test('une enveloppe changee apres lecture ne peut etre ecrasee', async () => {
  const concurrente = scellerAvecTrousseau(dek, cles)
  const concurrent = {
    query: async (sql: string, params: unknown[]) => {
      if (sql.startsWith('update public.cles_dossier'))
        await db.query('update cles_dossier set cle_scellee=$2 where dossier_id=$1', [
          id,
          concurrente,
        ])
      return query(sql, params)
    },
  }
  expect(await rescellerEnveloppes(concurrent, cles, { appliquer: true })).toMatchObject({
    courses: 1,
  })
  expect(await cle()).toEqual(concurrente)
})
test('une cle manquante ne remplace pas le contenu indechiffrable', async () => {
  expect(
    await rescellerEnveloppes(base, { ...cles, historique: nouvelleCle() }, { appliquer: true }),
  ).toMatchObject({ rescellees: 0, echecs: 2 })
  expect(await cle()).toEqual(ancienne)
})
test('un lot borne se reprend sans repasser sur ses lignes deja migrees', async () => {
  expect(await rescellerEnveloppes(base, cles, { appliquer: true, maximum: 1 })).toMatchObject({
    rescellees: 1,
    limite: true,
  })
  expect(await rescellerEnveloppes(base, cles, { appliquer: true })).toMatchObject({
    rescellees: 1,
    limite: false,
  })
})

test.each([0, 501, NaN])('un plafond invalide %s ne modifie rien', async (maximum) => {
  await expect(rescellerEnveloppes(base, cles, { appliquer: true, maximum })).rejects.toThrow(
    'Configuration',
  )
  expect(await cle()).toEqual(ancienne)
})

test('un courriel excessif est compte en echec et reste intact', async () => {
  const excessif = sceller(Buffer.alloc(1600000, 65), historique).toString('base64')
  await db.query('update courriels_sortants set contenu=$2 where id=$1', [id, excessif])
  expect(await rescellerEnveloppes(base, cles, { appliquer: true })).toMatchObject({
    rescellees: 1,
    echecs: 1,
  })
  expect(
    (
      await db.query<{ taille: number }>(
        'select length(contenu) taille from courriels_sortants where id=$1',
        [id],
      )
    ).rows[0]!.taille,
  ).toBe(excessif.length)
})
