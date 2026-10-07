import { beforeAll, afterAll, afterEach, expect, test } from 'vitest'
import { randomUUID, createHash } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai } from './base'
import {
  effacerPiecesIndividuelles,
  preparerEffacementPieces,
} from '@/lib/droits/effacement-pieces'
import { fixtureEffacementPieces } from '../scripts/fixture-effacement-pieces.mjs'
import type { BaseCollecte } from '@/lib/droits/collecte'
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

test('retire seulement la piece selectionnee et programme sa purge sans effacement global', async () => {
  const f = await fixtureEffacementPieces(db)
  const r = await effacerPiecesIndividuelles(db, f.brut)
  expect(r).toMatchObject({
    reprise: false,
    piecesRetirees: 1,
    suppressionsEnFile: 1,
    effacementComplet: false,
  })
  expect((await db.query('select id from pieces where id=$1', [f.piece.id])).rows).toHaveLength(0)
  expect(
    (
      await db.query('select id from pieces where dossier_id=any($1::uuid[])', [
        [f.locataire, f.etranger],
      ])
    ).rows,
  ).toHaveLength(2)
  expect((await db.query('select id from dossiers where id=$1', [f.garant])).rows).toHaveLength(1)
  expect(
    (await db.query('select dossier_id from engagements where dossier_id=$1', [f.garant])).rows,
  ).toHaveLength(1)
  expect(
    (await db.query('select chemin from chemins_abandonnes where chemin=$1', [f.piece.chemin]))
      .rows,
  ).toHaveLength(1)
  expect(await effacerPiecesIndividuelles(db, f.brut)).toMatchObject({
    reprise: true,
    suppressionsEnFile: 1,
  })
  await db.query('delete from objets_a_supprimer where chemin=$1', [f.piece.chemin])
  expect(await effacerPiecesIndividuelles(db, f.brut)).toMatchObject({
    reprise: true,
    suppressionsEnFile: 0,
    effacementComplet: false,
  })
  await expect(
    db.query(
      `insert into pieces(dossier_id,type,type_reel,chemin,taille_octets)
    values($1,'piece_identite','application/pdf',$2,100)`,
      [f.garant, f.piece.chemin],
    ),
  ).rejects.toThrow()
})

test.each(['piece', 'dossier'])('refuse la revision obsolete : %s', async (champ) => {
  const f = await fixtureEffacementPieces(db)
  if (champ === 'piece')
    await db.query('update pieces set taille_octets=101 where id=$1', [f.piece.id])
  if (champ === 'dossier')
    await db.query('update dossiers set revision_rappel=gen_random_uuid() where id=$1', [f.garant])
  await expect(effacerPiecesIndividuelles(db, f.brut)).rejects.toThrow(
    'Effacement individuel refuse.',
  )
  expect((await db.query('select id from pieces where id=$1', [f.piece.id])).rows).toHaveLength(1)
})

test('une decision modifiee, meme uniquement sa mise en forme, ne vaut pas approbation', async () => {
  const f = await fixtureEffacementPieces(db)
  await expect(effacerPiecesIndividuelles(db, f.brut + ' ')).rejects.toThrow()
  await expect(
    effacerPiecesIndividuelles(
      db,
      JSON.stringify({ ...f.decision, expireLe: '2000-01-01T00:00:00Z' }),
    ),
  ).rejects.toThrow()
  await expect(
    effacerPiecesIndividuelles(
      db,
      JSON.stringify({ ...f.decision, pieces: [f.decision.pieces[0], f.decision.pieces[0]] }),
    ),
  ).rejects.toThrow()
})

test('preparation refuse la piece tierce et ne retire rien', async () => {
  const f = await fixtureEffacementPieces(db)
  const tiers = (
    await db.query<{ id: string }>('select id from pieces where dossier_id=$1', [f.etranger])
  ).rows[0]!.id
  const projet = {
    ...(f.projet as object),
    pieces: [{ ...f.decision.pieces[0], id: tiers, dossier: f.etranger }],
  }
  const {
    chemin: _chemin,
    pieceSha256: _piece,
    dossierSha256: _dossier,
    ...selection
  } = projet.pieces[0]!
  await expect(
    preparerEffacementPieces(db, JSON.stringify({ ...projet, pieces: [selection] })),
  ).rejects.toThrow()
  expect((await db.query('select id from pieces where id=$1', [tiers])).rows).toHaveLength(1)
})

test('une nouvelle decision du registre invalide la precedente', async () => {
  const f = await fixtureEffacementPieces(db)
  await db.query(
    `insert into suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
    select gen_random_uuid(),demande,operation,operateur,nature,'en_cours',recu_le,repondre_avant,effacer_le,repeat('d',64)
    from suivi_demandes_droits where operation=$1`,
    [f.decision.revision],
  )
  await expect(effacerPiecesIndividuelles(db, f.brut)).rejects.toThrow()
})

test('une panne avant inscription annule le retrait et sa file', async () => {
  const f = await fixtureEffacementPieces(db)
  const panne: BaseCollecte = {
    query: (sql, params) => {
      if (sql.startsWith('insert into public.suivi_demandes_droits'))
        throw new Error('Panne fictive')
      return db.query<Record<string, unknown>>(sql, params)
    },
  }
  await expect(effacerPiecesIndividuelles(panne, f.brut)).rejects.toThrow()
  expect((await db.query('select id from pieces where id=$1', [f.piece.id])).rows).toHaveLength(1)
  expect(
    (await db.query('select chemin from objets_a_supprimer where chemin=$1', [f.piece.chemin]))
      .rows,
  ).toHaveLength(0)
  expect(await effacerPiecesIndividuelles(db, f.brut)).toMatchObject({ reprise: false })
})

test('une reponse de commit perdue se reprend sans seconde suppression', async () => {
  const f = await fixtureEffacementPieces(db)
  const panne: BaseCollecte = {
    query: async (sql, params) => {
      const r = await db.query<Record<string, unknown>>(sql, params)
      if (sql === 'commit') throw new Error('Reponse perdue')
      return r
    },
  }
  await expect(effacerPiecesIndividuelles(panne, f.brut)).rejects.toThrow()
  expect(await effacerPiecesIndividuelles(db, f.brut)).toMatchObject({ reprise: true })
})

test.each(['anon', 'authenticated', 'porteur_lien', 'serveur', 'depot_piece', 'service_role'])(
  'le role applicatif %s ne peut pas preparer ni executer',
  async (role) => {
    const f = await fixtureEffacementPieces(db)
    await db.exec(`set role ${role}`)
    await expect(preparerEffacementPieces(db, JSON.stringify(f.projet))).rejects.toThrow()
    await expect(effacerPiecesIndividuelles(db, f.brut)).rejects.toThrow()
    await db.exec('reset role')
    expect((await db.query('select id from pieces where id=$1', [f.piece.id])).rows).toHaveLength(1)
  },
)

async function reapprouver(f: Awaited<ReturnType<typeof fixtureEffacementPieces>>) {
  const precedente = f.decision.revision
  f.decision.revision = randomUUID()
  const brut = JSON.stringify(f.decision)
  await db.query(
    `insert into suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
    select $1,demande,operation,operateur,nature,'en_cours',recu_le,repondre_avant,effacer_le,$2
    from suivi_demandes_droits where operation=$3`,
    [f.decision.revision, createHash('sha256').update(brut).digest('hex'), precedente],
  )
  return brut
}

test.each(['tiers', 'expiree', 'trop_longue', 'chemin', 'mixte', 'conservation', 'identite'])(
  'meme approuvee, refuse la decision %s',
  async (cas) => {
    const f = await fixtureEffacementPieces(db)
    if (cas === 'tiers') f.decision.demandeur.email = 'autre@example.invalid'
    if (cas === 'expiree') f.decision.expireLe = '2000-01-01T00:00:00Z'
    if (cas === 'trop_longue')
      f.decision.expireLe = new Date(Date.now() + 80 * 3600000).toISOString()
    if (cas === 'chemin') f.decision.pieces[0]!.chemin = `${f.etranger}/autre`
    if (cas === 'mixte') Object.assign(f.decision.pieces[0]!, { appartenance: 'mixte' })
    if (cas === 'conservation') Object.assign(f.decision.pieces[0]!, { conservation: 'a_examiner' })
    if (cas === 'identite') f.decision.demandeur.identiteSha256 = ''
    await expect(effacerPiecesIndividuelles(db, await reapprouver(f))).rejects.toThrow()
    expect((await db.query('select id from pieces where id=$1', [f.piece.id])).rows).toHaveLength(1)
  },
)

test('une trace divergente ne permet pas de reprendre une autre decision', async () => {
  const f = await fixtureEffacementPieces(db)
  await effacerPiecesIndividuelles(db, f.brut)
  await expect(effacerPiecesIndividuelles(db, f.brut + ' ')).rejects.toThrow()
})

test('le catalogue Storage est distingue de la file et de la disparition physique', async () => {
  const f = await fixtureEffacementPieces(db)
  await db.query("insert into storage.objects(bucket_id,name) values('pieces',$1)", [
    f.piece.chemin,
  ])
  expect(await effacerPiecesIndividuelles(db, f.brut)).toMatchObject({
    objetsSignalesParStorage: 1,
    suppressionsEnFile: 1,
    effacementComplet: false,
  })
  await db.query('delete from objets_a_supprimer where chemin=$1', [f.piece.chemin])
  expect(await effacerPiecesIndividuelles(db, f.brut)).toMatchObject({
    objetsSignalesParStorage: 1,
    suppressionsEnFile: 0,
    effacementComplet: false,
  })
})

test('conserve la cle de coffre et les actes dont la retention est distincte', async () => {
  const f = await fixtureEffacementPieces(db)
  const agence = randomUUID(),
    acte = randomUUID()
  await db.query("insert into agences(id,nom,domaine) values($1,'Agence fictive',$2)", [
    agence,
    `${agence}.invalid`,
  ])
  await db.query(
    "insert into cles_dossier(dossier_id,cle_scellee) values($1,decode(repeat('00',60),'hex'))",
    [f.garant],
  )
  await db.query(
    "insert into demandes_signature(id,dossier_id,source_dossier,environnement,empreinte_acte) values($1,$2,$2,'sandbox',repeat('a',64))",
    [acte, f.garant],
  )
  await db.query(
    `insert into actes_signature(id,agence_id,modele,version_conditions,cle_scellee,contexte_chiffre,etape,expire_signature,conserver_jusqu_au)
    values($1,$2,'recette',1,decode(repeat('00',60),'hex'),decode(repeat('00',29),'hex'),'archive',now()+interval '1 day',now()+interval '1 year')`,
    [acte, agence],
  )
  await db.query("insert into storage.objects(bucket_id,name) values('actes',$1)", [
    `${acte}/preuve`,
  ])
  await effacerPiecesIndividuelles(db, f.brut)
  expect(
    (await db.query('select dossier_id from cles_dossier where dossier_id=$1', [f.garant])).rows,
  ).toHaveLength(1)
  expect(
    (await db.query("select id from actes_signature where id=$1 and etape='archive'", [acte])).rows,
  ).toHaveLength(1)
  expect(
    (
      await db.query("select name from storage.objects where bucket_id='actes' and name=$1", [
        `${acte}/preuve`,
      ])
    ).rows,
  ).toHaveLength(1)
})
