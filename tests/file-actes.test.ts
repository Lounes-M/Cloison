import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, afterEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai } from './base'
import { examinerFileActes } from '@/lib/exploitation/file-actes'
let db: PGlite
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
afterEach(async () => {
  await db.exec('reset role')
})
async function fixture(environnement = 'production') {
  const id = randomUUID(),
    agence = randomUUID(),
    dossier = randomUUID()
  await db.query(
    "insert into agences(id,nom,domaine,siren,carte_pro,statut,verifiee_le) values($1,'Agence fictive',$2,'123456789','CPI recette','verifiee',now())",
    [agence, `${agence}.invalid`],
  )
  await db.query(
    "insert into dossiers(id,agence_id,email_locataire,statut,expire_le) values($1,$2,'CONFIDENTIEL@example.invalid','transmis',now()+interval '10 days')",
    [dossier, agence],
  )
  await db.query(
    `insert into demandes_signature(id,dossier_id,source_dossier,environnement,empreinte_acte,etat,cree_le)
    values($1,$2,$2,$3,repeat('a',64),'done',now()-interval '2 days')`,
    [id, dossier, environnement],
  )
  await db.query(
    `insert into actes_signature(id,agence_id,modele,version_conditions,cle_scellee,contexte_chiffre,etape,expire_signature,conserver_jusqu_au)
    values($1,$2,'recette',1,decode(repeat('00',60),'hex'),decode(repeat('00',29),'hex'),'en_cours',now()+interval '1 day',now()+interval '1 year')`,
    [id, agence],
  )
  return { id, agence, dossier }
}
test('la base vide distingue absence de file et age inconnu', async () => {
  expect(await examinerFileActes(db, 'sandbox')).toMatchObject({
    total: 0,
    pretes: 0,
    age_max_demande_prete_secondes: null,
    retard_max_reprise_secondes: null,
    alerteOperation: false,
    alerteReprise: false,
  })
})
test('le rapport est agrege, separe les environnements et ne reserve aucune tache', async () => {
  const f = await fixture()
  await fixture('sandbox')
  const avant = (
    await db.query('select to_jsonb(a) objet from actes_signature a where id=$1', [f.id])
  ).rows
  const r = await examinerFileActes(db, 'production')
  expect(r).toMatchObject({
    pretes: 1,
    archivages_prets: 1,
    sans_tentative: 1,
    en_temporisation: 0,
    alerteReprise: false,
  })
  expect(r.age_max_demande_prete_secondes).toBeGreaterThanOrEqual(172800)
  expect(r.retard_max_reprise_secondes).toBeNull()
  for (const secret of [f.id, f.agence, f.dossier, 'CONFIDENTIEL', 'recette', 'cle_scellee'])
    expect(JSON.stringify(r)).not.toContain(secret)
  expect(
    (await db.query('select to_jsonb(a) objet from actes_signature a where id=$1', [f.id])).rows,
  ).toEqual(avant)
})
test('seules les reprises eligibles dont le delai est depasse declenchent une alerte', async () => {
  const f = await fixture('sandbox')
  await db.query(
    "update actes_signature set traitement_apres=now()-interval '16 minutes',traitement_dernier=now()-interval '1 hour' where id=$1",
    [f.id],
  )
  const r = await examinerFileActes(db, 'sandbox')
  expect(r).toMatchObject({ reprises_en_retard: 1, alerteReprise: true })
  expect(r.retard_max_reprise_secondes).toBeGreaterThanOrEqual(960)
  await db.query(
    "update actes_signature set traitement_apres=now()+interval '1 hour' where id=$1",
    [f.id],
  )
  expect(await examinerFileActes(db, 'sandbox')).toMatchObject({
    reprises_en_retard: 0,
    en_temporisation: 1,
    alerteReprise: false,
  })
})
test('une operation echue reste a examiner et ne devient jamais une tache disponible', async () => {
  const f = await fixture()
  const avant = await examinerFileActes(db, 'production')
  await db.query(
    "update actes_signature set operation=gen_random_uuid(),operation_jusqu_au=now()-interval '1 hour' where id=$1",
    [f.id],
  )
  const r = await examinerFileActes(db, 'production')
  expect(r.operations_echeance_depassee).toBe(avant.operations_echeance_depassee + 1)
  expect(r.pretes).toBe(avant.pretes - 1)
  expect(r.alerteOperation).toBe(true)
})
test.each([
  'dossier_expire',
  'anomalie',
  'validation',
  'refus',
  'archive',
  'incertain',
  'agence_suspendue',
  'fournisseur_annule',
])('une situation hors reprise ne gonfle pas la file prete : %s', async (cas) => {
  const f = await fixture()
  const avant = await examinerFileActes(db, 'production')
  if (cas === 'dossier_expire')
    await db.query(
      "update dossiers set cree_le=now()-interval '3 days',expire_le=now()-interval '1 day' where id=$1",
      [f.dossier],
    )
  if (cas === 'anomalie')
    await db.query('update demandes_signature set anomalie=true where id=$1', [f.id])
  if (cas === 'validation')
    await db.query("update actes_signature set etape='a_valider' where id=$1", [f.id])
  if (cas === 'refus')
    await db.query("update actes_signature set etape='refuse' where id=$1", [f.id])
  if (cas === 'archive')
    await db.query("update actes_signature set etape='archive' where id=$1", [f.id])
  if (cas === 'incertain')
    await db.query("update actes_signature set etape='incertain' where id=$1", [f.id])
  if (cas === 'agence_suspendue' || cas === 'fournisseur_annule') {
    await db.query("update actes_signature set etape='valide' where id=$1", [f.id])
    if (cas === 'agence_suspendue')
      await db.query("update agences set statut='suspendue' where id=$1", [f.agence])
    else await db.query("update demandes_signature set etat='canceled' where id=$1", [f.id])
  }
  expect((await examinerFileActes(db, 'production')).pretes).toBe(avant.pretes - 1)
})
test.each([
  'anon',
  'authenticated',
  'porteur_lien',
  'serveur',
  'depot_piece',
  'archive_signature',
  'service_role',
])('le role applicatif %s ne recoit pas le diagnostic global', async (role) => {
  await db.exec(`set role ${role}`)
  await expect(examinerFileActes(db, 'production')).rejects.toThrow()
})
test('un environnement inconnu est refuse avant toute requete', async () => {
  await expect(
    examinerFileActes(
      {
        query: () => {
          throw new Error('Ne doit pas etre appele')
        },
      },
      'autre',
    ),
  ).rejects.toThrow('Mode de diagnostic invalide.')
})
