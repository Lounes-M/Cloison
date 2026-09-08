import { afterAll, beforeAll, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire, refus } from './base'
let db: PGlite
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
test('le lien et son intention de livraison existent dans la meme transaction', async () => {
  await devenir(db, 'serveur')
  const { rows } = await db.query<{ dossier_id: string; jti: string }>(
    "select * from ouvrir_dossier_avec_lien('fictif@example.invalid','7 days')",
  )
  const d = rows[0]!
  const { rows: liens } = await db.query<{ id: string }>('select * from liens_a_livrer($1)', [
    d.dossier_id,
  ])
  expect(liens.map((l) => l.id)).toEqual([d.jti])
  expect(await refus(db, `select mettre_lien_en_file('${d.jti}','')`)).toContain(
    'Contenu chiffre requis',
  )
  expect((await db.query('select * from liens_a_livrer($1)', [d.dossier_id])).rows).toHaveLength(1)
  expect(
    (
      await db.query<{ ok: boolean }>('select mettre_lien_en_file($1,$2) as ok', [
        d.jti,
        'Y2hpZmZyZQ==',
      ])
    ).rows[0]!.ok,
  ).toBe(true)
  expect((await db.query('select * from liens_a_livrer($1)', [d.dossier_id])).rows).toHaveLength(0)
  await db.query("select * from emettre_jeton($1,'locataire','7 days')", [d.dossier_id])
  await redevenirProprietaire(db)
  const { rows: ancien } = await db.query<{ contenu: null; annule_le: string }>(
    'select contenu,annule_le from courriels_sortants where id=$1',
    [d.jti],
  )
  expect(ancien[0]!.contenu).toBeNull()
  expect(ancien[0]!.annule_le).toBeTruthy()
  await devenir(db, 'serveur')
  expect((await db.query('select * from prendre_courriels($1)', [d.jti])).rows).toHaveLength(0)
})
test('aucun role public ou porteur ne lit ni ne programme les livraisons', async () => {
  for (const role of ['anon', 'authenticated', 'porteur_lien'] as const) {
    await devenir(db, role)
    expect(await refus(db, 'select * from livraisons_liens')).toContain('permission denied')
    expect(await refus(db, 'select * from liens_a_livrer(null)')).toContain('permission denied')
  }
})

test('les liens expires restent hors du transport et les intentions anciennes alertent', async () => {
  await redevenirProprietaire(db)
  await db.exec(
    'update courriels_sortants set annule_le=now(),a_reconcilier=false;delete from livraisons_liens',
  )
  await devenir(db, 'serveur')
  const d = (
    await db.query<{ dossier_id: string; jti: string }>(
      "select * from ouvrir_dossier_avec_lien('ancien@example.invalid','7 days')",
    )
  ).rows[0]!
  await redevenirProprietaire(db)
  await db.query("update livraisons_liens set cree_le=now()-interval '2 hours' where id=$1", [
    d.jti,
  ])
  await devenir(db, 'serveur')
  const rapport = (
    await db.query<{ r: { alertes: { courriels_a_reconcilier: number } } }>(
      'select rapport_exploitation() as r',
    )
  ).rows[0]!.r
  expect(rapport.alertes.courriels_a_reconcilier).toBe(1)
  await db.query('select mettre_lien_en_file($1,$2)', [d.jti, 'Y2hpZmZyZQ=='])
  await redevenirProprietaire(db)
  await db.query("update courriels_sortants set expire_le=now()-interval '1 second' where id=$1", [
    d.jti,
  ])
  await devenir(db, 'serveur')
  expect((await db.query('select * from prendre_courriels($1)', [d.jti])).rows).toHaveLength(0)
  await db.query('select etat_file_courriels()')
  await redevenirProprietaire(db)
  expect(
    (
      await db.query<{ contenu: null }>('select contenu from courriels_sortants where id=$1', [
        d.jti,
      ])
    ).rows[0]!.contenu,
  ).toBeNull()
})
