import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { nouvelleCle, sceller, ouvrir } from '../lib/coffre/enveloppe.ts'
import { ouvrirAvecTrousseau } from '../lib/coffre/rotation-format.ts'

async function commeGarant(db, dossier, jti, action) {
  await db.query('begin; set local role porteur_lien')
  try {
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ role: 'porteur_lien', role_partie: 'garant', dossier_id: dossier, jti }),
    ])
    const resultat = await action()
    await db.query('commit')
    return resultat
  } catch (erreur) {
    await db.query('rollback')
    throw erreur
  }
}

// Uniquement appele apres les gardes de deux clusters vierges du harnais natif.
export async function preparerParcoursRestauration(db, source, jtiSource, kek, original) {
  const dossier = randomUUID(),
    jti = randomUUID(),
    piece = randomUUID()
  const chemin = `${dossier}/${piece}`,
    dek = nouvelleCle()
  const saisie = {
    profil: 'salarie',
    couvre: 'loyer',
    montant: '800',
    revenu: '2800',
    jusquAu: '',
    solidaire: false,
  }
  const contenu = { usage: 'brouillon-engagement-v1', dossier, version: 0, saisie }
  await db.query(
    "insert into dossiers(id,email_locataire,email_garant) values($1,'reprise@example.invalid','garant@example.invalid')",
    [dossier],
  )
  await db.query('insert into cles_dossier(dossier_id,cle_scellee) values($1,$2)', [
    dossier,
    sceller(dek, kek),
  ])
  await db.query(
    "insert into jetons_actifs(dossier_id,partie,jti,expire_le) values($1,'garant',$2,clock_timestamp()+interval '1 day')",
    [dossier, jti],
  )
  const revision = await commeGarant(
    db,
    dossier,
    jti,
    async () =>
      (
        await db.query('select public.sauver_brouillon_engagement($1,0,null) revision', [
          sceller(Buffer.from(JSON.stringify(contenu)), dek),
        ])
      ).rows[0].revision,
  )
  assert(revision, 'Brouillon fictif non cree')
  const sourcePiece = (await db.query('select id from pieces where dossier_id=$1', [source]))
    .rows[0].id
  await db.query('insert into reservations_depot(dossier_id,chemin) values($1,$2)', [
    dossier,
    chemin,
  ])
  await db.query("insert into storage.objects(bucket_id,name) values('pieces',$1)", [chemin])
  await db.query('begin; set local role depot_piece')
  try {
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({
        role: 'depot_piece',
        role_partie: 'garant',
        dossier_id: dossier,
        jti,
        copie_version: 'copie-v1',
        copie_dossier: source,
        copie_jti: jtiSource,
        copie_piece: sourcePiece,
        copie_empreinte: createHash('sha256').update(original).digest('hex'),
      }),
    ])
    await db.query(
      "insert into pieces(id,dossier_id,type,chemin,taille_octets,type_reel) values($1,$2,'bulletin_paie',$3,$4,'application/pdf')",
      [piece, dossier, chemin, original.length],
    )
    await db.query('commit')
  } catch (erreur) {
    await db.query('rollback')
    throw erreur
  }
  const brouillon = (
    await db.query('select * from brouillons_engagement where dossier_id=$1', [dossier])
  ).rows[0]
  const provenance = (await db.query('select * from provenances_pieces where piece_id=$1', [piece]))
    .rows[0]
  assert(provenance, 'Provenance fictive non creee')
  return {
    dossier,
    jti,
    piece,
    chemin,
    contenu,
    brouillon,
    provenance,
    chiffre: sceller(original, dek),
  }
}

export async function verifierParcoursRestaures(db, fixture, objet, original, trousseau) {
  const { dossier, jti, piece, brouillon, provenance, contenu } = fixture
  assert.deepEqual(
    (await db.query('select * from brouillons_engagement where dossier_id=$1', [dossier])).rows,
    [brouillon],
  )
  assert.deepEqual(
    (await db.query('select * from provenances_pieces where piece_id=$1', [piece])).rows,
    [provenance],
  )
  const cle = ouvrirAvecTrousseau(
    (await db.query('select cle_scellee from cles_dossier where dossier_id=$1', [dossier])).rows[0]
      .cle_scellee,
    trousseau,
  )
  assert.deepEqual(JSON.parse(ouvrir(brouillon.chiffre, cle).toString('utf8')), contenu)
  assert.deepEqual(ouvrir(objet, cle), original)
  await commeGarant(db, dossier, randomUUID(), async () => {
    assert.equal((await db.query('select * from public.mon_brouillon_engagement()')).rowCount, 0)
    assert.equal((await db.query('select * from provenances_pieces')).rowCount, 0)
  })
  await commeGarant(db, dossier, jti, async () => {
    const lu = (await db.query('select * from public.mon_brouillon_engagement()')).rows
    assert.equal(lu.length, 1)
    assert.equal(lu[0].revision, brouillon.revision)
    assert.deepEqual(lu[0].chiffre, brouillon.chiffre)
    assert.deepEqual((await db.query('select * from provenances_pieces')).rows, [provenance])
    assert.equal(
      (
        await db.query('select public.sauver_brouillon_engagement(null,0,$1) revision', [
          randomUUID(),
        ])
      ).rows[0].revision,
      null,
    )
  })
}

export async function verifierEffacementsRestaures(
  db,
  fixture,
  objet,
  original,
  trousseau,
  source,
) {
  // Chaque mutation reste dans une transaction annulee sur la copie restauree.
  await db.query('begin')
  try {
    await db.query('delete from pieces where dossier_id=$1', [source])
    await verifierParcoursRestauresSansTransaction(db, fixture, objet, original, trousseau)
    await db.query('delete from pieces where id=$1', [fixture.piece])
    assert.equal(
      (await db.query('select * from provenances_pieces where piece_id=$1', [fixture.piece]))
        .rowCount,
      0,
    )
    await db.query(
      "update brouillons_engagement set expire_le=clock_timestamp()-interval '1 second' where dossier_id=$1",
      [fixture.dossier],
    )
    await db.query('set local role porteur_lien')
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({
        role: 'porteur_lien',
        role_partie: 'garant',
        dossier_id: fixture.dossier,
        jti: fixture.jti,
      }),
    ])
    assert.equal((await db.query('select * from public.mon_brouillon_engagement()')).rowCount, 0)
  } finally {
    await db.query('rollback')
  }
}
async function verifierParcoursRestauresSansTransaction(db, fixture, objet, original, trousseau) {
  assert.deepEqual(
    (await db.query('select * from provenances_pieces where piece_id=$1', [fixture.piece])).rows,
    [fixture.provenance],
  )
  const cle = ouvrirAvecTrousseau(
    (await db.query('select cle_scellee from cles_dossier where dossier_id=$1', [fixture.dossier]))
      .rows[0].cle_scellee,
    trousseau,
  )
  assert.deepEqual(ouvrir(objet, cle), original)
}
