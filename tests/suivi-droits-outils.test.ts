import { afterAll, beforeAll, expect, test } from 'vitest'
import { randomUUID, createHash } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'

import { baseDEssai } from './base'
import {
  configurationSuiviDroits,
  consignerSuiviDroits,
} from '../scripts/consigner-suivi-droits.mjs'
import {
  configurationLectureDroits,
  examinerSuiviDroits,
} from '../scripts/examiner-suivi-droits.mjs'

let db: PGlite
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
const client = () => db
test('le curseur conserve les microsecondes PostgreSQL sans repeter une ligne', async () => {
  const { rows: crees } = await db.query<{
    demande: string
  }>(`insert into suivi_demandes_droits(operation,demande,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
 select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'acces','recue','2026-01-01T00:00:00Z','2026-01-02T00:00:00.123456Z',clock_timestamp()+interval '10 days',repeat('a',64) from generate_series(1,52) returning demande`)
  try {
    const a = await examinerSuiviDroits(client(), { etat: 'tous' })
    expect(a.suivant).toEqual(expect.objectContaining({ echeance: '2026-01-02T00:00:00.123456Z' }))
    const b = await examinerSuiviDroits(client(), { etat: 'tous', apres: a.suivant })
    const ids = (a.demandes as { demande: string }[]).map((r) => r.demande)
    expect((b.demandes as { demande: string }[]).some((r) => ids.includes(r.demande))).toBe(false)
  } finally {
    await db.exec("begin;select set_config('cloison.purge_droits','active',true)")
    await db.query('delete from suivi_demandes_droits where demande=any($1::uuid[])', [
      crees.map((r) => r.demande),
    ])
    await db.exec('commit')
  }
})
function entree() {
  return {
    connexion: 'postgresql://localhost/fiction',
    operation: randomUUID(),
    demande: randomUUID(),
    precedente: null as string | null,
    operateur: randomUUID(),
    nature: 'acces',
    etat: 'recue',
    recuLe: new Date(Date.now() - 86400000).toISOString(),
    repondreAvant: new Date(Date.now() + 86400000).toISOString(),
    effacerLe: new Date(Date.now() + 86400000 * 90).toISOString(),
    preuve: 'Compte rendu exclusivement fictif et prive',
  }
}
test.each([
  'demande',
  'precedente',
  'operateur',
  'nature',
  'etat',
  'preuve_sha256',
  'recu_le',
  'repondre_avant',
  'effacer_le',
  'compte_base',
])('aucune confirmation divergente sur %s ne valide une ecriture', async (champ) => {
  const v = entree()
  const faux = {
    query: async (sql: string, params?: unknown[]) => {
      const r = await db.query<Record<string, unknown>>(sql, params)
      if (sql.startsWith('select *,session_user'))
        r.rows[0]![champ] =
          champ.endsWith('_le') || champ === 'repondre_avant' ? new Date(0) : 'divergence'
      return r
    },
  }
  await expect(consignerSuiviDroits(faux, v)).rejects.toThrow('Etape non enregistree')
  expect(
    (
      await db.query('select operation from suivi_demandes_droits where operation=$1', [
        v.operation,
      ])
    ).rows,
  ).toEqual([])
})
test('un suivi expire reste invisible avant sa purge physique', async () => {
  const v = entree()
  await consignerSuiviDroits(client(), v)
  await db.exec('alter table suivi_demandes_droits disable trigger droits_etapes_immuables')
  try {
    await db.query(
      "update suivi_demandes_droits set recu_le='2026-01-01',repondre_avant='2026-01-02',effacer_le='2026-01-03' where demande=$1",
      [v.demande],
    )
  } finally {
    await db.exec('alter table suivi_demandes_droits enable trigger droits_etapes_immuables')
  }
  await expect(examinerSuiviDroits(client(), { demande: v.demande })).rejects.toThrow(
    'Suivi indisponible',
  )
  const r = await examinerSuiviDroits(client(), { etat: 'tous' })
  expect(r.demandes).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ demande: v.demande })]),
  )
})
test.each(['historique', 'expiration'])(
  'un controle de lecture invalide %s ferme le rapport',
  async (controle) => {
    const v = entree()
    await consignerSuiviDroits(client(), v)
    const faux = {
      query: async (sql: string, params?: unknown[]) => {
        const r = await db.query<Record<string, unknown>>(sql, params)
        if (controle === 'historique' && sql.startsWith('with recursive')) r.rows = []
        if (controle === 'expiration' && sql.startsWith('select effacer_le>'))
          r.rows = [{ valable: false }]
        return r
      },
    }
    await expect(examinerSuiviDroits(faux, { demande: v.demande })).rejects.toThrow(
      controle === 'historique' ? 'Historique de suivi incoherent' : 'Suivi indisponible',
    )
  },
)
test('la preuve est hachee avant toute requete et absente de la configuration', () => {
  const v = entree(),
    c = configurationSuiviDroits(v)
  expect(c).not.toHaveProperty('preuve')
  expect(c.empreinte).toBe(createHash('sha256').update(v.preuve).digest('hex'))
  expect(JSON.stringify(c)).not.toContain(v.preuve)
})
test.each([
  'postgresql://example.com/db?sslmode=disable',
  'https://example.com/db',
  'postgresql://example.com/db#x',
])('refuse une connexion ambigue %s', (connexion) => {
  expect(() => configurationSuiviDroits({ ...entree(), connexion })).toThrow()
  expect(() => configurationLectureDroits({ connexion, selection: { etat: 'ouverts' } })).toThrow()
})
test('la verification TLS est reservee aux connexions distantes', () => {
  expect(configurationSuiviDroits(entree()).locale).toBe(true)
  expect(
    configurationSuiviDroits({ ...entree(), connexion: 'postgresql://db.example.com/fiction' })
      .locale,
  ).toBe(false)
})
test('les champs libres et les dates incoherentes sont refuses avant SQL', async () => {
  for (const surcharge of [
    { email: 'fictif@example.com' },
    { effacerLe: new Date(0).toISOString() },
    { preuve: '' },
    { repondreAvant: new Date(0).toISOString() },
  ]) {
    await expect(consignerSuiviDroits(client(), { ...entree(), ...surcharge })).rejects.toThrow()
  }
})
test('une ecriture et son rejeu donnent une seule etape relisible', async () => {
  const v = entree()
  expect(await consignerSuiviDroits(client(), v)).toEqual({ cree: true })
  expect(await consignerSuiviDroits(client(), v)).toEqual({ cree: false })
  const rapport = await examinerSuiviDroits(client(), { demande: v.demande })
  expect(rapport.etapes).toHaveLength(1)
  expect(JSON.stringify(rapport)).not.toContain(v.preuve)
  expect(JSON.stringify(rapport)).not.toContain(v.connexion)
  await expect(
    consignerSuiviDroits(client(), { ...v, preuve: 'autre preuve fictive' }),
  ).rejects.toThrow('Etape non enregistree')
  expect((await examinerSuiviDroits(client(), { demande: v.demande })).etapes).toHaveLength(1)
})
test('le rapport suit la chaine et retire les demandes closes de la liste ouverte', async () => {
  const v = entree()
  await consignerSuiviDroits(client(), v)
  const reponse = { ...v, operation: randomUUID(), precedente: v.operation, etat: 'repondu' }
  await consignerSuiviDroits(client(), reponse)
  await consignerSuiviDroits(client(), {
    ...reponse,
    operation: randomUUID(),
    precedente: reponse.operation,
    etat: 'clos',
  })
  expect((await examinerSuiviDroits(client(), { demande: v.demande })).etapes).toHaveLength(3)
  const ouverts = await examinerSuiviDroits(client(), { etat: 'ouverts' })
  expect(ouverts.demandes).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ demande: v.demande })]),
  )
  const tous = await examinerSuiviDroits(client(), { etat: 'tous' })
  expect(tous.demandes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ demande: v.demande, etat: 'clos', en_retard: false }),
    ]),
  )
})
test('un identifiant absent ne fournit aucun rapport', async () => {
  await expect(examinerSuiviDroits(client(), { demande: randomUUID() })).rejects.toThrow(
    'Suivi indisponible',
  )
})
test('la pagination ne perd aucune demande quand les echeances sont identiques', async () => {
  const modele = entree(),
    attendus = []
  for (let i = 0; i < 52; i++) {
    const v = { ...modele, demande: randomUUID(), operation: randomUUID() }
    attendus.push(v.demande)
    await consignerSuiviDroits(client(), v)
  }
  let apres: unknown = null
  const vus: string[] = []
  do {
    const r = await examinerSuiviDroits(client(), { etat: 'tous', apres })
    const lignes = r.demandes as { demande: string }[]
    expect(lignes.length).toBeLessThanOrEqual(50)
    vus.push(...lignes.map((x) => x.demande))
    apres = r.suivant
  } while (apres)
  expect(new Set(vus).size).toBe(vus.length)
  expect(vus).toEqual(expect.arrayContaining(attendus))
})
