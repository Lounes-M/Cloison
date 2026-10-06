import { afterAll, beforeAll, expect, test } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai, devenir, redevenirProprietaire, refus } from './base'
let db: PGlite
const agence = '10000000-0000-4000-8000-000000000001',
  user = '20000000-0000-4000-8000-000000000001',
  autre = '20000000-0000-4000-8000-000000000002'
const ancien = '30000000-0000-4000-8000-000000000001',
  actuel = '30000000-0000-4000-8000-000000000002',
  nouveau = '30000000-0000-4000-8000-000000000003'
async function session(id: string, options: Record<string, unknown> = {}) {
  await devenir(db, 'authenticated', user)
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      role: 'authenticated',
      sub: user,
      aal: 'aal2',
      session_id: id,
      amr: [{ method: 'mfa/recovery_code' }],
      ...options,
    }),
  ])
}
async function agenceCourante() {
  return (await db.query<{ a: string | null }>('select agence_courante() a')).rows[0]!.a
}
async function recuperer() {
  return (await db.query<{ ok: boolean }>('select revoquer_sessions_apres_recuperation() ok'))
    .rows[0]!.ok
}
beforeAll(async () => {
  db = await baseDEssai()
  await db.exec(
    `insert into agences(id,nom,domaine) values('${agence}','Agence A','a.invalid');insert into auth.users(id,email,email_confirmed_at) values('${user}','a@a.invalid',now()),('${autre}','b@a.invalid',now());insert into membres_agence(agence_id,utilisateur_id,role) values('${agence}','${user}','admin');insert into auth.sessions(id,user_id,aal,created_at) values('${ancien}','${user}','aal2',now()-interval '2 days'),('${actuel}','${user}','aal2',now()-interval '1 day');`,
  )
})
afterAll(async () => {
  await db.close()
})
test('avant recuperation les droits existants sont preserves', async () => {
  await devenir(db, 'authenticated', user)
  expect(await agenceCourante()).toBe(agence)
})
test.each([
  { aal: 'aal1' },
  { amr: [] },
  { amr: [{ method: 'totp' }] },
  { session_id: nouveau },
  { session_id: 'incorrect' },
  { sub: autre },
])('recuperation refusee sans preuve de session : %j', async (options) => {
  await session(actuel, options)
  expect(await recuperer()).toBe(false)
})
test('recuperation coupe les anciens JWT meme encore presents dans Auth', async () => {
  await session(actuel)
  expect(await recuperer()).toBe(true)
  expect(await agenceCourante()).toBe(agence)
  await session(ancien)
  expect(await agenceCourante()).toBeNull()
  expect(await recuperer()).toBe(false)
  await redevenirProprietaire(db)
  expect((await db.query('select * from auth.sessions')).rows).toHaveLength(2)
  await db.exec(`insert into auth.sessions(id,user_id,aal) values('${nouveau}','${user}','aal2')`)
  await session(nouveau)
  expect(await agenceCourante()).toBe(agence)
})
test.each([{ session_id: 'incorrect' }, { session_id: null }, { sub: autre }, { aal: 'aal1' }])(
  'claims invalides apres recuperation : %j',
  async (options) => {
    await session(actuel, options)
    expect(await agenceCourante()).toBeNull()
  },
)
test('la session preservee doit encore exister et rester aal2', async () => {
  await redevenirProprietaire(db)
  await db.exec(`update auth.sessions set aal='aal1' where id='${actuel}'`)
  await session(actuel)
  expect(await agenceCourante()).toBeNull()
  expect(await recuperer()).toBe(false)
  await redevenirProprietaire(db)
  await db.exec(`delete from auth.sessions where id='${actuel}'`)
  await session(actuel)
  expect(await agenceCourante()).toBeNull()
})
test('les roles applicatifs ne lisent ni ne modifient la coupure', async () => {
  for (const role of ['anon', 'authenticated', 'porteur_lien', 'serveur'] as const) {
    await devenir(db, role, user)
    expect(await refus(db, 'select * from sessions_recuperation')).toContain('permission denied')
    expect(await refus(db, 'delete from sessions_recuperation')).toContain('permission denied')
    expect(await refus(db, 'select session_recuperee_valide()')).toContain('permission denied')
    if (role !== 'authenticated')
      expect(await refus(db, 'select revoquer_sessions_apres_recuperation()')).toContain(
        'permission denied',
      )
  }
})
