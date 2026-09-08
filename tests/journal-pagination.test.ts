import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, devenirPorteur, redevenirProprietaire } from './base'
let db: PGlite
const dossier = '00000000-0000-4000-8000-000000000091',
  autre = '00000000-0000-4000-8000-000000000092',
  utilisateur = '00000000-0000-4000-8000-000000000093'
beforeAll(async () => {
  db = await baseDEssai()
  await db.exec(
    `insert into agences(id,nom,domaine) values ('00000000-0000-4000-8000-000000000094','Journal A','journal-a.invalid'),('00000000-0000-4000-8000-000000000095','Journal B','journal-b.invalid');insert into auth.users(id,email,email_confirmed_at) values ('${utilisateur}','admin@journal-a.invalid',now());insert into membres_agence(agence_id,utilisateur_id,role) values ('00000000-0000-4000-8000-000000000094','${utilisateur}','admin');insert into dossiers(id,agence_id,email_locataire) values ('${dossier}','00000000-0000-4000-8000-000000000094','a@example.invalid'),('${autre}','00000000-0000-4000-8000-000000000095','b@example.invalid');insert into journal_acces(dossier_id,acteur,acteur_id,action,quand) select '${dossier}','agence','${utilisateur}','dossier_consulte',now()-interval '10 minutes' from generate_series(1,110);insert into journal_acces(dossier_id,acteur,action) values ('${autre}','garant','dossier_consulte');`,
  )
})
afterAll(async () => db.close())
beforeEach(async () => {
  await db.exec('begin')
})
afterEach(async () => {
  await db.exec('rollback')
})
async function lire(d = dossier, avant?: { id: string; quand: string }) {
  return (
    await db.query<{ id: string; quand: string; identite: string | null }>(
      'select * from journal_du_dossier($1,$2,$3)',
      [d, avant?.quand ?? null, avant?.id ?? null],
    )
  ).rows
}
test('les pages restent bornees et ne perdent pas les evenements a date identique', async () => {
  await devenirPorteur(db, dossier, 'garant')
  const premiere = await lire()
  expect(premiere).toHaveLength(51)
  await redevenirProprietaire(db)
  await db.query(
    "insert into journal_acces(dossier_id,acteur,action) values ($1,'garant','dossier_consulte')",
    [dossier],
  )
  await devenirPorteur(db, dossier, 'garant')
  const deuxieme = await lire(dossier, premiere[49])
  const troisieme = await lire(dossier, deuxieme[49])
  expect(deuxieme).toHaveLength(51)
  expect(troisieme).toHaveLength(10)
  expect(
    new Set([...premiere.slice(0, 50), ...deuxieme.slice(0, 50), ...troisieme].map((j) => j.id))
      .size,
  ).toBe(110)
})
test('le curseur ne contourne ni le dossier, ni le role, ni MFA, ni l echeance', async () => {
  await devenirPorteur(db, dossier, 'garant')
  expect(await lire(autre)).toEqual([])
  await devenirPorteur(db, dossier, 'locataire')
  expect(await lire()).toEqual([])
  await devenir(db, 'authenticated', utilisateur)
  expect(await lire()).toHaveLength(51)
  expect(await lire(autre)).toEqual([])
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role: 'authenticated', sub: utilisateur, aal: 'aal1' }),
  ])
  expect(await lire()).toEqual([])
  await redevenirProprietaire(db)
  await db.query(
    "update dossiers set cree_le=now()-interval '4 months',expire_le=now()-interval '1 second' where id=$1",
    [dossier],
  )
  await devenir(db, 'authenticated', utilisateur)
  expect(await lire()).toEqual([])
})
test('une adresse devenue personnelle ne fuit ni par le nouveau journal ni par l ancien RPC', async () => {
  await devenirPorteur(db, dossier, 'garant')
  expect((await lire())[0]!.identite).toBe('admin@journal-a.invalid')
  await redevenirProprietaire(db)
  await db.query("update auth.users set email='prive@example.invalid' where id=$1", [utilisateur])
  await devenirPorteur(db, dossier, 'garant')
  expect((await lire()).every((j) => j.identite === null)).toBe(true)
  expect(
    (await db.query<{ identite: string | null }>('select * from mon_journal_acces()')).rows.every(
      (j) => j.identite === null,
    ),
  ).toBe(true)
})
test('un anonyme ne peut pas appeler le journal', async () => {
  await devenir(db, 'anon')
  await expect(lire()).rejects.toThrow('permission denied')
})
test('un curseur SQL partiel est refuse', async () => {
  await devenirPorteur(db, dossier, 'garant')
  await expect(
    db.query('select * from journal_du_dossier($1,now(),null)', [dossier]),
  ).rejects.toThrow('Curseur incomplet')
})
