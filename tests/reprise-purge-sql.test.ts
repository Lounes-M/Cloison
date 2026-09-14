import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire } from './base'
import { creerObservateurPurge } from '@/lib/exploitation/reprise-purge'

let db: PGlite
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})

test('un effet SQL suivi dune reponse perdue ne double pas la file ni ne supprime lacte signe', async () => {
  const journal = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const { rows } = await db.query<{ id: string }>(`
      insert into dossiers(email_locataire,reference)
      values('actif@example.invalid','REPRISEACTIF'),('expire@example.invalid','REPRISEEXPIRE'),('signe@example.invalid','REPRISESIGNE') returning id
    `)
    const [actif, expire, signe] = rows.map((r) => r.id)
    for (const id of [actif!, expire!, signe!]) {
      await db.query("insert into storage.objects(bucket_id,name) values('pieces',$1)", [
        `${id}/fixture`,
      ])
      await db.query('insert into cles_dossier(dossier_id,cle_scellee) values($1,$2)', [
        id,
        Buffer.alloc(60, 3),
      ])
    }
    await db.query("update dossiers set statut='signe' where id=$1", [signe])
    await db.query(
      "update dossiers set cree_le=now()-interval '4 months',expire_le=now()-interval '1 day' where id=any($1::uuid[])",
      [[expire, signe]],
    )
    await devenir(db, 'serveur')
    const effets: number[] = []
    const executer = async () => {
      const { rows: resultat } = await db.query<{ nombre: number }>(
        'select purger_les_dossiers_expires() as nombre',
      )
      effets.push(resultat[0]!.nombre)
      return effets.length === 1
        ? { data: null, error: { message: 'reponse perdue fictive' }, status: 504 }
        : { data: resultat[0]!.nombre, error: null, status: 200 }
    }
    expect(await creerObservateurPurge(new AbortController().signal)('coffre', executer)).toEqual({
      data: 0,
      error: null,
      status: 200,
    })
    expect(effets).toEqual([2, 0])
    await redevenirProprietaire(db)
    expect((await db.query('select id from dossiers where id=$1', [expire])).rows).toHaveLength(0)
    expect(
      (
        await db.query('select id from dossiers where id=$1 and coffre_purge_le is not null', [
          signe,
        ])
      ).rows,
    ).toHaveLength(1)
    expect(
      (await db.query('select id from dossiers where id=$1 and coffre_purge_le is null', [actif]))
        .rows,
    ).toHaveLength(1)
    expect((await db.query('select dossier_id from cles_dossier')).rows).toEqual([
      { dossier_id: actif },
    ])
    expect(
      (
        await db.query<{ chemin: string }>('select chemin from objets_a_supprimer order by chemin')
      ).rows.map((r) => r.chemin),
    ).toEqual([`${expire}/fixture`, `${signe}/fixture`].sort())
  } finally {
    journal.mockRestore()
  }
})
