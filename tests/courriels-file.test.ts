import { afterEach, beforeEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire } from './base'
let db: PGlite
const id = '00000000-0000-4000-8000-000000000001'
beforeEach(async () => {
  db = await baseDEssai()
})
afterEach(async () => {
  await db.close()
})
async function ajouter() {
  await devenir(db, 'serveur')
  await db.query('select public.mettre_courriel_en_file($1,$2)', [id, 'chiffre'])
}
test('un anonyme ne lit et ne remplit pas la file', async () => {
  await devenir(db, 'anon')
  await expect(db.query('select * from courriels_sortants')).rejects.toThrow('permission denied')
  await expect(db.query('select public.mettre_courriel_en_file($1,$2)', [id, 'x'])).rejects.toThrow(
    'permission denied',
  )
})
test('le bail empeche deux traitements et un acquittement obsolete', async () => {
  await ajouter()
  const premier = (await db.query<{ bail: string }>('select * from public.prendre_courriels()'))
    .rows[0]!
  expect((await db.query('select * from public.prendre_courriels()')).rows).toEqual([])
  await db.query('select public.terminer_courriel($1,$2,true)', [id, id])
  await redevenirProprietaire(db)
  expect(
    (await db.query<{ contenu: string }>('select contenu from courriels_sortants')).rows[0]!
      .contenu,
  ).toBe('chiffre')
  await devenir(db, 'serveur')
  await db.query('select public.terminer_courriel($1,$2,true)', [id, premier.bail])
  await redevenirProprietaire(db)
  expect(
    (await db.query('select contenu,envoye_le is not null as envoye from courriels_sortants')).rows,
  ).toEqual([{ contenu: null, envoye: true }])
})
test('une issue inconnue ancienne exige reconciliation au lieu de risquer un doublon', async () => {
  await ajouter()
  await db.query('select * from public.prendre_courriels()')
  await redevenirProprietaire(db)
  await db.query(
    "update courriels_sortants set premier_essai=now()-interval '25 hours',bail_expire_le=now()-interval '1 minute'",
  )
  await devenir(db, 'serveur')
  expect((await db.query('select * from public.prendre_courriels()')).rows).toEqual([])
  await redevenirProprietaire(db)
  expect((await db.query('select a_reconcilier from courriels_sortants')).rows).toEqual([
    { a_reconcilier: true },
  ])
})
test('un changement de statut laisse une notification durable, sans donner les contacts au locataire', async () => {
  const dossier = (
    await db.query<{ id: string }>(
      "insert into dossiers(email_locataire,reference) values ('courriel@audit.invalid','MAIL12345678') returning id",
    )
  ).rows[0]!.id
  await db.query("update dossiers set statut='depot_en_cours' where id=$1", [dossier])
  await devenir(db, 'serveur')
  const notifications = (
    await db.query<{ id: string; dossier: { statut: string } }>(
      'select * from notifications_a_livrer()',
    )
  ).rows
  expect(notifications).toHaveLength(1)
  expect(notifications[0]!.dossier.statut).toBe('depot_en_cours')
  await devenir(db, 'porteur_lien')
  await expect(db.query('select * from notifications_a_livrer()')).rejects.toThrow(
    'permission denied',
  )
  await devenir(db, 'serveur')
  await db.query('select acquitter_notification($1)', [notifications[0]!.id])
  expect((await db.query('select * from notifications_a_livrer()')).rows).toEqual([])
})
