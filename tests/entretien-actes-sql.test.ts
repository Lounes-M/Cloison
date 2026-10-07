import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'
import { baseDEssai } from './base'
import { creerEntretienActes } from '@/lib/exploitation/entretien-actes'
let db: PGlite
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(async () => {
  await db.exec('reset role')
  vi.restoreAllMocks()
})
test('une expiration executee avant perte de reponse conserve une seule suppression durable', async () => {
  const id = randomUUID(),
    fichier = randomUUID()
  await db.query("insert into agences(id,nom,domaine) values($1,'Agence fictive',$2)", [
    id,
    `${id}.invalid`,
  ])
  await db.query("insert into dossiers(id,email_locataire) values($1,'fictif@example.invalid')", [
    id,
  ])
  await db.query(
    "insert into demandes_signature(id,dossier_id,source_dossier,environnement,empreinte_acte) values($1,$1,$1,'sandbox',repeat('a',64))",
    [id],
  )
  await db.query(
    `insert into actes_signature(id,agence_id,modele,version_conditions,cle_scellee,contexte_chiffre,etape,expire_signature,conserver_jusqu_au)
    values($1,$1,'recette',1,decode(repeat('00',60),'hex'),decode(repeat('00',29),'hex'),'archive',now()-interval '2 days',now()-interval '1 day')`,
    [id],
  )
  await db.query(
    "insert into fichiers_signature(id,acte_id,nature,empreinte,taille,nonce,confirme) values($1,$2,'acte',repeat('a',64),100,decode(repeat('00',12),'hex'),true)",
    [fichier, id],
  )
  await db.exec('set role serveur')
  let appels = 0
  const rpc = vi.fn(async () => {
    const r = await db.query<{ n: number }>('select expirer_archives_signature() n')
    appels++
    return appels === 1
      ? { data: null, error: { message: 'Passerelle fictive' }, status: 504 }
      : { data: r.rows[0]!.n, error: null, status: 200 }
  })
  expect(
    (
      await creerEntretienActes(
        { rpc } as unknown as SupabaseClient,
        new AbortController().signal,
      ).expirer()
    ).data,
  ).toBe(0)
  expect(rpc).toHaveBeenCalledTimes(2)
  await db.exec('reset role')
  expect(
    (await db.query('select cle_scellee,contexte_chiffre from actes_signature where id=$1', [id]))
      .rows,
  ).toEqual([{ cle_scellee: null, contexte_chiffre: null }])
  expect(
    (
      await db.query('select chemin from archives_signature_a_supprimer where chemin=$1', [
        `${id}/${fichier}`,
      ])
    ).rows,
  ).toHaveLength(1)
})
test('la confirmation SQL rejouee ne transforme jamais un echec en succes', async () => {
  await db.exec('set role serveur')
  let appels = 0
  const rpc = vi.fn(async (_nom: string, args: { le_nom: string; reussite: boolean }) => {
    const r = await db.query<{ ok: boolean }>('select confirmer_traitement_actes($1,$2) ok', [
      args.le_nom,
      args.reussite,
    ])
    return ++appels === 1
      ? { data: null, error: {}, status: 502 }
      : { data: r.rows[0]!.ok, error: null, status: 200 }
  })
  expect(
    (
      await creerEntretienActes(
        { rpc } as unknown as SupabaseClient,
        new AbortController().signal,
      ).confirmer('reglements', false)
    ).data,
  ).toBe(true)
  await db.exec('reset role')
  expect(
    (await db.query("select reussi from traitements_actes where nom='reglements'")).rows,
  ).toEqual([{ reussi: false }])
  expect(rpc).toHaveBeenCalledTimes(2)
})
