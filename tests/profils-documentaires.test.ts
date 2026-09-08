import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { baseDEssai, devenirPorteur, redevenirProprietaire, reserverObjetDEssai } from './base'
let db: PGlite
const dossier = '22222222-2222-4222-8222-222222222221'
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  await db.query(
    "insert into dossiers(id,email_locataire,loyer_cents) values($1,'fictif@example.invalid',100000)",
    [dossier],
  )
  await db.query('insert into engagements(dossier_id,revenu_net_mensuel_cents) values($1,300000)', [
    dossier,
  ])
  for (const type of ['avis_imposition', 'piece_identite', 'justificatif_domicile'])
    await ajouter(type)
})
afterEach(async () => {
  await db.exec('rollback')
})
async function ajouter(type: string, nombre = 1) {
  await redevenirProprietaire(db)
  const id = randomUUID(),
    chemin = `${dossier}/${id}`
  await reserverObjetDEssai(db, dossier, chemin)
  await db.query(
    "insert into pieces(id,dossier_id,type,chemin,taille_octets,type_reel,nombre_documents) values($1,$2,$3,$4,100,'application/pdf',$5)",
    [id, dossier, type, chemin, nombre],
  )
  return id
}
async function statut() {
  await redevenirProprietaire(db)
  return (await db.query<{ statut: string }>('select statut from dossiers where id=$1', [dossier]))
    .rows[0]!.statut
}
test('un seul bulletin nest pas presente comme trois, puis le groupe declare complete la presence', async () => {
  const piece = await ajouter('bulletin_paie')
  expect(await statut()).toBe('depot_en_cours')
  await devenirPorteur(db, dossier, 'garant')
  expect(
    (await db.query('select declarer_nombre_documents($1,3) resultat', [piece])).rows[0],
  ).toEqual({ resultat: true })
  expect(await statut()).toBe('complet')
})
test('trois bulletins separes completent la presence', async () => {
  for (let i = 0; i < 3; i++) await ajouter('bulletin_paie')
  expect(await statut()).toBe('complet')
})
test('le retraite utilise ses droits a pension sans bulletin de salaire', async () => {
  await devenirPorteur(db, dossier, 'garant')
  await db.query("update engagements set profil_ressources='retraite' where dossier_id=$1", [
    dossier,
  ])
  await ajouter('pension_retraite')
  expect(await statut()).toBe('complet')
})
test.each(['bilans', 'attestation'])(
  'lindependant fournit son activite et ses ressources par %s',
  async (mode) => {
    await devenirPorteur(db, dossier, 'garant')
    await db.query("update engagements set profil_ressources='independant' where dossier_id=$1", [
      dossier,
    ])
    await ajouter(
      mode === 'bilans' ? 'bilan_comptable' : 'attestation_ressources',
      mode === 'bilans' ? 2 : 1,
    )
    expect(await statut()).toBe('depot_en_cours')
    await ajouter('activite_independante')
    expect(await statut()).toBe('complet')
  },
)
test('un changement de profil ne conserve pas une presence complete devenue inexacte', async () => {
  await ajouter('bulletin_paie', 3)
  expect(await statut()).toBe('complet')
  await devenirPorteur(db, dossier, 'garant')
  await db.query("update engagements set profil_ressources='retraite' where dossier_id=$1", [
    dossier,
  ])
  expect(await statut()).toBe('depot_en_cours')
})
test('le locataire ne lit pas le profil et ne corrige pas les pieces du garant', async () => {
  const piece = await ajouter('bulletin_paie')
  await devenirPorteur(db, dossier, 'locataire')
  expect((await db.query('select profil_ressources from engagements')).rows).toEqual([])
  expect(
    (await db.query('select declarer_nombre_documents($1,3) resultat', [piece])).rows[0],
  ).toEqual({ resultat: false })
})
test('un autre garant ne peut changer le nombre declare', async () => {
  const piece = await ajouter('bulletin_paie', 3)
  const autre = randomUUID()
  await db.query("insert into dossiers(id,email_locataire) values($1,'autre@example.invalid')", [
    autre,
  ])
  await devenirPorteur(db, autre, 'garant')
  expect(
    (await db.query('select declarer_nombre_documents($1,1) resultat', [piece])).rows[0],
  ).toEqual({ resultat: false })
})
test('un dossier transmis refuse la correction du nombre declare', async () => {
  const piece = await ajouter('bulletin_paie', 3)
  await db.query("update dossiers set statut='transmis' where id=$1", [dossier])
  await devenirPorteur(db, dossier, 'garant')
  expect(
    (await db.query('select declarer_nombre_documents($1,1) resultat', [piece])).rows[0],
  ).toEqual({ resultat: false })
})

test('un dossier transmis refuse aussi le changement de profil', async () => {
  await ajouter('bulletin_paie', 3)
  await db.query("update dossiers set statut='transmis' where id=$1", [dossier])
  await devenirPorteur(db, dossier, 'garant')
  await expect(
    db.query(
      "update engagements set profil_ressources='retraite' where dossier_id=$1 returning dossier_id",
      [dossier],
    ),
  ).rejects.toThrow('Ce dossier est fige.')
})
