import { expect, test } from 'vitest'
import {
  verifierUrlRestauration,
  verifierCorrespondanceCluster,
  // @ts-expect-error Harnais Node autonome execute par le job PostgreSQL.
} from '../scripts/verifier-restauration-postgres.mjs'

test('le harnais refuse cloud, autre base, options de connexion et autre bootstrap', () => {
  for (const url of [
    'postgres://postgres:fixture@projet.supabase.co/cloison_restauration_test',
    'postgres://postgres:fixture@127.0.0.1/production',
    'postgres://postgres:fixture@127.0.0.1/cloison_restauration_test?host=ailleurs',
    'postgres://postgres:fixture@127.0.0.1/cloison_restauration_test#options',
    'postgres://autre:fixture@127.0.0.1/cloison_restauration_test',
  ])
    expect(() => verifierUrlRestauration(url)).toThrow()
  expect(
    verifierUrlRestauration('postgres://postgres:fixture@127.0.0.1:5433/cloison_restauration_test')
      .port,
  ).toBe('5433')
})

test('un conteneur qui ne correspond pas au cluster controle est refuse', () => {
  const outil = (nom: string, args: string[]) => {
    expect(nom).toBe('psql')
    expect(args).toContain('cloison_restauration_test')
    expect(args).toContain('-X')
    return Buffer.from('cloison_restauration_test:123456\n')
  }
  expect(() => verifierCorrespondanceCluster(outil, '999999')).toThrow('Identite du conteneur')
  expect(() => verifierCorrespondanceCluster(outil, '123456')).not.toThrow()
})
