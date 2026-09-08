import { expect, test } from 'vitest'
import { baseDEssai } from './base'
// @ts-expect-error Harnais Node autonome execute par le job PostgreSQL.
import { photographier } from '../scripts/verifier-restauration-postgres.mjs'

test('les ACL par defaut et explicites equivalentes se restaurent sans masquer un droit ajoute', async () => {
  const db = await baseDEssai()
  try {
    await db.exec('create sequence public.sequence_restauration_fictive')
    const initial = await photographier(db)
    await db.exec('revoke all on sequence public.sequence_restauration_fictive from anon')
    expect(await photographier(db)).toEqual(initial)
    await db.exec('grant usage on sequence public.sequence_restauration_fictive to anon')
    expect(await photographier(db)).not.toEqual(initial)
  } finally {
    await db.close()
  }
})
