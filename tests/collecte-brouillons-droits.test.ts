import { beforeAll, afterAll, test, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai } from './base'
import { fixtureBrouillonsDroits } from '../scripts/fixture-brouillons-droits.mjs'
import { collecterBrouillonsDroits, collecterCopiePersonnelle } from '../lib/droits/brouillons'
import { decisionCollecte } from '../lib/droits/collecte'
let db: PGlite
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
test.each([false, true])(
  'collecte la saisie incomplete avec rotation=%s sans la valider',
  async (rotation) => {
    const f = await fixtureBrouillonsDroits(db, rotation)
    const r = await collecterCopiePersonnelle(db, f.brut, f.trousseau)
    expect('brouillons' in r.donnees && r.donnees.brouillons[0]?.saisie).toEqual(f.saisie)
    expect('brouillons' in r.donnees && r.donnees.brouillons[0]?.nature).toBe('saisie_non_validee')
    expect(r.donnees.remiseAutorisee).toBe(false)
    expect(r.donnees.inventaireComplet).toBe(false)
    expect(r.donnees.sourcesNonCouvertes).toContain('brouillons_non_selectionnes')
    expect(JSON.stringify(r.donnees)).not.toContain(f.trousseau.historique.toString('hex'))
    await r.verifier()
  },
)
test('absence de cle refuse tout le fichier si les brouillons sont demandes', async () => {
  const f = await fixtureBrouillonsDroits(db)
  await expect(collecterCopiePersonnelle(db, f.brut)).rejects.toThrow()
})
test('un brouillon efface ne restitue aucune ancienne saisie', async () => {
  const f = await fixtureBrouillonsDroits(db)
  await db.query('update brouillons_engagement set chiffre=null where dossier_id=$1', [f.dossier])
  const r = await collecterBrouillonsDroits(db, f.brut, f.trousseau)
  expect(r.brouillons[0]?.saisie).toBeNull()
})
test.each(['revision', 'contenu', 'expiration', 'suppression', 'cle'])(
  'refuse une modification tardive : %s',
  async (cas) => {
    const f = await fixtureBrouillonsDroits(db),
      r = await collecterCopiePersonnelle(db, f.brut, f.trousseau)
    if (cas === 'revision')
      await db.query('update brouillons_engagement set revision=$1 where dossier_id=$2', [
        randomUUID(),
        f.dossier,
      ])
    if (cas === 'contenu')
      await db.query('update brouillons_engagement set chiffre=null where dossier_id=$1', [
        f.dossier,
      ])
    if (cas === 'expiration')
      await db.query(
        "update brouillons_engagement set expire_le=clock_timestamp()-interval '1 second' where dossier_id=$1",
        [f.dossier],
      )
    if (cas === 'suppression')
      await db.query('delete from brouillons_engagement where dossier_id=$1', [f.dossier])
    if (cas === 'cle') await db.query('delete from cles_dossier where dossier_id=$1', [f.dossier])
    await expect(r.verifier()).rejects.toThrow()
  },
)
test('refuse une autre cle, un chiffre corrompu et une revision non approuvee', async () => {
  const f = await fixtureBrouillonsDroits(db)
  f.trousseau.historique.fill(0)
  await expect(collecterBrouillonsDroits(db, f.brut, f.trousseau)).rejects.toThrow()
  await db.query('update brouillons_engagement set chiffre=$1 where dossier_id=$2', [
    Buffer.alloc(29),
    f.dossier,
  ])
  await expect(collecterBrouillonsDroits(db, f.brut, f.trousseau)).rejects.toThrow()
  await expect(
    collecterBrouillonsDroits(
      db,
      JSON.stringify({
        ...f.decision,
        brouillons: [{ dossier: f.dossier, revision: randomUUID() }],
      }),
      f.trousseau,
    ),
  ).rejects.toThrow()
})
test('refuse les dossiers locataire et les doublons avant SQL', async () => {
  const f = await fixtureBrouillonsDroits(db)
  expect(() =>
    decisionCollecte(
      JSON.stringify({
        ...f.decision,
        brouillons: [{ dossier: f.locataire, revision: f.revision }],
      }),
    ),
  ).toThrow()
  expect(() =>
    decisionCollecte(
      JSON.stringify({
        ...f.decision,
        brouillons: [...f.decision.brouillons!, ...f.decision.brouillons!],
      }),
    ),
  ).toThrow()
})
test.each(['anon', 'authenticated', 'porteur_lien', 'serveur', 'depot_piece', 'service_role'])(
  'le role %s ne peut pas collecter',
  async (role) => {
    const f = await fixtureBrouillonsDroits(db)
    await db.exec(`set role ${role}`)
    try {
      await expect(collecterBrouillonsDroits(db, f.brut, f.trousseau)).rejects.toThrow()
    } finally {
      await db.exec('reset role')
    }
  },
)
