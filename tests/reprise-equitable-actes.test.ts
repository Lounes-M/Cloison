import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire } from './base'
let db: PGlite
const premier = randomUUID(),
  second = randomUUID()
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
  await db.exec(
    "update agences set siren='123456789',carte_pro='CPI recette'; update agences set statut='verifiee',verifiee_le=now(); update dossiers set statut='transmis'",
  )
  for (const [i, id] of [premier, second].entries()) {
    await db.query(
      `insert into demandes_signature(id,dossier_id,source_dossier,environnement,empreinte_acte,reference_fournisseur,etat,cree_le)
      values($1,current_setting('cloison.ocr_dossier')::uuid,current_setting('cloison.ocr_dossier')::uuid,'production',$2,gen_random_uuid(),'done',now()-($3 || ' days')::interval)`,
      [id, String(i).repeat(64), 2 - i],
    )
    await db.query(
      `insert into actes_signature(id,agence_id,modele,version_conditions,cle_scellee,contexte_chiffre,etape,expire_signature,conserver_jusqu_au)
      select $1,agence_id,'recette',1,decode(repeat('00',60),'hex'),decode(repeat('00',29),'hex'),'en_cours',now()+interval '2 days',now()+interval '1 year' from dossiers where id=current_setting('cloison.ocr_dossier')::uuid`,
      [id],
    )
  }
})
afterEach(async () => {
  await db.exec('rollback')
  await redevenirProprietaire(db)
})
async function choisir(mode = 'production') {
  await devenir(db, 'serveur')
  return (await db.query<{ id: string }>('select public.actes_a_traiter($1) id', [mode])).rows.map(
    (r) => r.id,
  )
}
test('un ancien archivage en echec laisse avancer le suivant sans double selection', async () => {
  expect(await choisir()).toEqual([premier])
  expect(await choisir()).toEqual([second])
  expect(await choisir()).toEqual([])
})
test('le delai de reprise persiste et augmente de cinq minutes a une heure', async () => {
  for (const delai of [300, 600, 1200, 2400, 3600, 3600]) {
    await redevenirProprietaire(db)
    await db.query("update actes_signature set traitement_apres='-infinity' where id=$1", [premier])
    await db.query(
      "update actes_signature set traitement_apres=now()+interval '2 hours' where id=$1",
      [second],
    )
    expect(await choisir()).toEqual([premier])
    await redevenirProprietaire(db)
    const r = (
      await db.query<{ delai: number }>(
        'select extract(epoch from traitement_apres-clock_timestamp())::float8 delai from actes_signature where id=$1',
        [premier],
      )
    ).rows[0]!
    expect(r.delai).toBeGreaterThan(delai - 3)
    expect(r.delai).toBeLessThanOrEqual(delai)
  }
})
test('une progression reinitialise le delai et les tentatives', async () => {
  await choisir()
  await redevenirProprietaire(db)
  await db.query("update actes_signature set etape='document' where id=$1", [premier])
  const r = (
    await db.query<{ tentatives: number; eligible: boolean }>(
      'select traitement_tentatives tentatives,traitement_apres<=clock_timestamp() eligible from actes_signature where id=$1',
      [premier],
    )
  ).rows[0]!
  expect(r).toEqual({ tentatives: 0, eligible: true })
})
test('une demande en operation incertaine reste exclue et ne se reemet pas', async () => {
  await db.query('update actes_signature set operation=gen_random_uuid() where id=$1', [premier])
  expect(await choisir()).toEqual([second])
})
test('le choix respecte le mode et les anomalies', async () => {
  expect(await choisir('sandbox')).toEqual([])
  await redevenirProprietaire(db)
  await db.query('update demandes_signature set anomalie=true where id=$1', [premier])
  expect(await choisir()).toEqual([second])
})
test.each(['anon', 'authenticated', 'porteur_lien', 'depot_piece', 'archive_signature'])(
  'la reservation refuse le role %s',
  async (role) => {
    await db.exec(`set role ${role}`)
    await expect(db.query("select public.actes_a_traiter('production')")).rejects.toThrow(
      /permission denied/,
    )
  },
)

test('un ancien acte redevenu eligible passe apres un acte jamais tente', async () => {
  await choisir()
  await redevenirProprietaire(db)
  await db.query("update actes_signature set traitement_apres='-infinity' where id=$1", [premier])
  expect(await choisir()).toEqual([second])
})
