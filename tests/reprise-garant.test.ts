import { afterAll, beforeAll, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenirPorteur, redevenirProprietaire, refus } from './base'

let db: PGlite
let dossier: string
beforeAll(async () => {
  db = await baseDEssai()
  const { rows } = await db.query<{ id: string }>(
    "insert into public.dossiers(email_locataire,email_garant,paye_le,paiement_ref) values ('locataire@example.invalid','garant@example.invalid',now(),'fixture_reprise') returning id",
  )
  dossier = rows[0]!.id
})
afterAll(async () => {
  if (db) await db.close()
})

test.each(['transmis', 'refuse', 'signe'])(
  'renouveler apres %s revoque le precedent sans modifier le dossier',
  async (statut) => {
    await redevenirProprietaire(db)
    await db.query('update public.dossiers set statut=$1 where id=$2', [statut, dossier])
    await devenirPorteur(db, dossier, 'locataire')
    const premier = await db.query<{ jti: string; expire_le: Date }>(
      "select * from public.designer_garant_avec_lien('garant@example.invalid')",
    )
    const second = await db.query<{ jti: string; expire_le: Date }>(
      "select * from public.designer_garant_avec_lien('garant@example.invalid')",
    )
    expect(second.rows[0]!.jti).not.toBe(premier.rows[0]!.jti)
    expect(
      await refus(db, "select * from public.designer_garant_avec_lien('autre@example.invalid')"),
    ).toContain('ne peut pas etre remplace')
    const ligne = await db.query('select statut,email_garant from public.dossiers where id=$1', [
      dossier,
    ])
    expect(ligne.rows[0]).toEqual({ statut, email_garant: 'garant@example.invalid' })
    for (const [jti, attendu] of [
      [premier.rows[0]!.jti, null],
      [second.rows[0]!.jti, dossier],
    ] as const) {
      await db.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ role: 'porteur_lien', dossier_id: dossier, role_partie: 'garant', jti }),
      ])
      const acces = await db.query<{ id: string | null }>('select public.dossier_courant() as id')
      expect(acces.rows[0]!.id).toBe(attendu)
    }
  },
)
