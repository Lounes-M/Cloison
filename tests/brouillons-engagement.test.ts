import { beforeAll, beforeEach, afterAll, afterEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenirPorteur, redevenirProprietaire } from './base'
let db: PGlite, dossier: string
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('begin')
  dossier = (
    await db.query<{ id: string }>(
      "insert into dossiers(email_locataire,email_garant,reference) values('l@example.invalid','g@example.invalid','BROUILLON123') returning id",
    )
  ).rows[0]!.id
  await devenirPorteur(db, dossier, 'garant')
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})
const chiffre = Buffer.alloc(48, 9)
async function sauver(
  revision: string | null = null,
  contenu: Buffer | null = chiffre,
  version = 0,
) {
  return (
    await db.query<{ r: string | null }>('select sauver_brouillon_engagement($1,$2,$3) r', [
      contenu,
      version,
      revision,
    ])
  ).rows[0]!.r
}
async function lire() {
  return (
    await db.query<{ revision: string; chiffre: Uint8Array | null; expire_le: string }>(
      'select * from mon_brouillon_engagement()',
    )
  ).rows
}
test('sauvegarde, conflit, suppression et revision de suppression', async () => {
  const r = await sauver()
  expect(r).toBeTruthy()
  expect(await sauver()).toBeNull()
  const initial = (await lire())[0]!
  expect(Buffer.from(initial.chiffre!)).toEqual(chiffre)
  const suivant = await sauver(r)
  expect(suivant).not.toBe(r)
  expect((await lire())[0]!.expire_le).toEqual(initial.expire_le)
  const efface = await sauver(suivant, null)
  expect(efface).toBeTruthy()
  expect((await lire())[0]!.chiffre).toBeNull()
  expect(await sauver(r)).toBeNull()
  expect(await sauver()).toBeNull()
  expect(await sauver(efface)).toBeTruthy()
})
test.each(['locataire', 'autre-dossier', 'revoque', 'expire'])(
  'refus de capacite : %s',
  async (cas) => {
    await sauver()
    await redevenirProprietaire(db)
    if (cas === 'locataire') await devenirPorteur(db, dossier, 'locataire')
    if (cas === 'autre-dossier') {
      const autre = (
        await db.query<{ id: string }>(
          "insert into dossiers(email_locataire,reference) values('autre@example.invalid','AUTREBROUILL') returning id",
        )
      ).rows[0]!.id
      await devenirPorteur(db, autre, 'garant')
    }
    if (cas === 'revoque' || cas === 'expire') {
      await devenirPorteur(db, dossier, 'garant')
      await db.exec('reset role')
      await db.query(
        cas === 'revoque'
          ? 'update jetons_actifs set jti=gen_random_uuid() where dossier_id=$1'
          : "update jetons_actifs set emis_le=clock_timestamp()-interval '2 days',expire_le=clock_timestamp()-interval '1 day' where dossier_id=$1",
        [dossier],
      )
      await db.exec('set role porteur_lien')
    }
    expect(await lire()).toEqual([])
    if (cas !== 'autre-dossier') expect(await sauver()).toBeNull()
  },
)
test('un lien renouvele du meme garant retrouve la saisie', async () => {
  const r = await sauver()
  await devenirPorteur(db, dossier, 'garant')
  expect((await lire())[0]!.revision).toBe(r)
})
test.each(['transmis', 'signe'])('pas de sauvegarde apres %s', async (statut) => {
  await sauver()
  await redevenirProprietaire(db)
  await db.query('update dossiers set statut=$1 where id=$2', [statut, dossier])
  expect((await db.query('select * from brouillons_engagement')).rows).toEqual([])
  await devenirPorteur(db, dossier, 'garant')
  expect(await sauver()).toBeNull()
})
test('le remplacement du garant reste interdit et ne transfere aucun brouillon', async () => {
  await sauver()
  await redevenirProprietaire(db)
  await db.exec('savepoint remplacement')
  await expect(
    db.query("update dossiers set email_garant='remplacant@example.invalid' where id=$1", [
      dossier,
    ]),
  ).rejects.toThrow(/ne peut pas etre remplace/)
  await db.exec('rollback to remplacement')
  expect((await db.query('select * from brouillons_engagement')).rows).toHaveLength(1)
})
test('une declaration invalide le brouillon et sa version', async () => {
  await sauver()
  await redevenirProprietaire(db)
  await db.query(
    "insert into engagements(dossier_id,couvre,montant_max_cents,jusqu_au,solidaire) values($1,'loyer',10000,'2027-01-01',true)",
    [dossier],
  )
  expect((await db.query('select * from brouillons_engagement')).rows).toEqual([])
  await devenirPorteur(db, dossier, 'garant')
  expect(await sauver()).toBeNull()
  expect(await sauver(null, chiffre, 1)).toBeTruthy()
})
test.each([0, 28, 4097])('contenu de taille %s refuse', async (taille) => {
  expect(await sauver(null, Buffer.alloc(taille))).toBeNull()
})
test('expiration refusee avant maintenance et purge physique', async () => {
  await sauver()
  await db.exec('reset role')
  await db.query(
    "update brouillons_engagement set expire_le=clock_timestamp()-interval '1 second' where dossier_id=$1",
    [dossier],
  )
  await db.exec('set role porteur_lien')
  expect(await lire()).toEqual([])
  await db.exec('set role serveur')
  expect(
    (await db.query<{ n: number }>('select purger_brouillons_engagement() n')).rows[0]!.n,
  ).toBe(1)
  await redevenirProprietaire(db)
  expect((await db.query('select * from brouillons_engagement')).rows).toEqual([])
})
test.each(['anon', 'authenticated', 'serveur', 'depot_piece', 'service_role'])(
  'le role %s ne lit pas le brouillon',
  async (role) => {
    await sauver()
    await db.exec(`set local role ${role}`)
    await db.exec('savepoint refus')
    await expect(lire()).rejects.toThrow(/permission denied/)
    await db.exec('rollback to refus')
    await expect(db.query('select * from brouillons_engagement')).rejects.toThrow(
      /permission denied/,
    )
    await db.exec('rollback to refus')
    await expect(sauver()).rejects.toThrow(/permission denied/)
    await db.exec('rollback to refus')
  },
)
