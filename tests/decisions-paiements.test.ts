import { beforeAll, beforeEach, afterAll, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai } from './base'
import { diagnostiquerPaiement } from '../scripts/diagnostic-paiement.mjs'
import {
  configurationDecision,
  consignerDecision,
} from '../scripts/consigner-decision-paiement.mjs'

let db: PGlite
const dossier = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const operation = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const operateur = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
function envelopper(diagnostic: unknown) {
  const contenu = JSON.stringify(diagnostic)
  return {
    format: 'cloison-diagnostic-paiement-v1',
    contenu,
    sha256: createHash('sha256').update(contenu).digest('hex'),
  }
}
async function configuration() {
  return {
    connexion: 'postgres://fictif@localhost/cloison_audit_test',
    operation,
    operateur,
    decision: 'a_examiner',
    rapport: envelopper(await diagnostiquerPaiement(db, 'cs_decision')),
  }
}
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec(`truncate decisions_paiements; delete from evenements_paiements;
    delete from rapprochements_paiements;`)
  await db.exec(
    'delete from registre_paiements; delete from sessions_paiement; delete from dossiers',
  )
  await db.query<Record<string, unknown>>(
    "insert into dossiers(id,email_locataire) values($1,'PRIVE@example.invalid')",
    [dossier],
  )
  await db.query<Record<string, unknown>>(
    "insert into sessions_paiement(dossier_id,session_ref) values($1,'cs_decision')",
    [dossier],
  )
  await db.query<Record<string, unknown>>(
    `select enregistrer_paiement_locataire('evt_decision','cs_decision','pi_decision',$1,900,'eur','locataire-2026-09-04',now())`,
    [dossier],
  )
  await db.exec("update registre_paiements set anomalie=true where reference_session='cs_decision'")
})

test('la repetition SQL des droits se termine sans conserver ses fixtures', async () => {
  const avant = (await db.query<Record<string, unknown>>('select empreinte_schema() as schema'))
    .rows
  await db.exec('begin')
  try {
    await db.exec(readFileSync('supabase/essais/decisions-paiements.sql', 'utf8'))
  } finally {
    await db.exec('rollback')
  }
  expect(
    (await db.query<Record<string, unknown>>('select * from decisions_paiements')).rows,
  ).toEqual([])
  expect(
    (await db.query<Record<string, unknown>>('select empreinte_schema() as schema')).rows,
  ).toEqual(avant)
})

test.each(['compte_base', 'inscrit_le'])(
  'la base impose %s au lieu de la valeur declaree',
  async (champ) => {
    await db.query<Record<string, unknown>>(
      `insert into decisions_paiements(operation,operateur,reference_session,decision,rapport_sha256,rapport_observe_le,compte_base,inscrit_le)
    values($1,$2,'cs_decision','a_examiner',$3,now(),'falsifie','2000-01-01')`,
      [operation, operateur, 'a'.repeat(64)],
    )
    const ligne = (
      await db.query<Record<string, unknown>>(
        'select compte_base,inscrit_le,session_user as courant from decisions_paiements',
      )
    ).rows[0]
    if (champ === 'compte_base') expect(ligne?.compte_base).toBe(ligne?.courant)
    else expect(new Date(String(ligne?.inscrit_le)).getFullYear()).toBeGreaterThan(2000)
  },
)

test.each(['9999-12-31', 'infinity', '1969-01-01'])(
  'la base refuse une date de rapport incoherente : %s',
  async (date) => {
    await expect(
      db.query<Record<string, unknown>>(
        `insert into decisions_paiements(operation,operateur,reference_session,decision,rapport_sha256,rapport_observe_le)
    values($1,$2,'cs_decision','a_examiner',$3,$4)`,
        [operation, operateur, 'a'.repeat(64), date],
      ),
    ).rejects.toThrow('Date de diagnostic invalide')
  },
)

test('une confirmation incoherente annule toute inscription', async () => {
  const c = await configuration()
  const espion = {
    query: async (sql: string, params?: unknown[]) => {
      const resultat = await db.query<Record<string, unknown>>(sql, params)
      if (sql.startsWith('select operateur'))
        return { rows: resultat.rows.map((r) => ({ ...r, rapport_observe_le: '2000-01-01' })) }
      return resultat
    },
  }
  await expect(consignerDecision(espion, c)).rejects.toThrow('Decision non enregistree')
  expect(
    (await db.query<Record<string, unknown>>('select * from decisions_paiements')).rows,
  ).toEqual([])
})

test('une decision est durable et rejouable sans acquitter une anomalie', async () => {
  const c = await configuration()
  const avant = (await db.query<Record<string, unknown>>('select etat_paiements() as etat')).rows
  expect(await consignerDecision(db, c)).toEqual({ cree: true })
  expect(await consignerDecision(db, c)).toEqual({ cree: false })
  const { rows } = await db.query<Record<string, unknown>>('select * from decisions_paiements')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    operation,
    operateur,
    reference_session: 'cs_decision',
    decision: 'a_examiner',
    rapport_sha256: c.rapport.sha256,
  })
  expect(rows[0]?.compte_base).toBe(
    (await db.query<Record<string, unknown>>('select session_user as nom')).rows[0]?.nom,
  )
  expect(JSON.stringify(rows)).not.toMatch(/PRIVE|contenu|email|pi_decision/)
  await consignerDecision(db, {
    ...c,
    operation: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    decision: 'corrige',
  })
  expect((await db.query<Record<string, unknown>>('select etat_paiements() as etat')).rows).toEqual(
    avant,
  )
})
test.each(['decision', 'operateur', 'rapport'])(
  'le rejeu contradictoire sur %s ne remplace pas la decision',
  async (champ) => {
    const c = await configuration()
    await consignerDecision(db, c)
    const changement =
      champ === 'decision'
        ? 'justifie'
        : champ === 'operateur'
          ? dossier
          : envelopper({ ...JSON.parse(c.rapport.contenu), note: 'autre' })
    await expect(consignerDecision(db, { ...c, [champ]: changement })).rejects.toThrow(
      'Decision non enregistree',
    )
    expect(
      (
        await db.query<Record<string, unknown>>(
          'select decision,rapport_sha256 from decisions_paiements',
        )
      ).rows,
    ).toEqual([{ decision: 'a_examiner', rapport_sha256: c.rapport.sha256 }])
  },
)
test('les decisions ne peuvent etre modifiees ou effacees et survivent au dossier', async () => {
  await consignerDecision(db, await configuration())
  await expect(db.exec("update decisions_paiements set decision='corrige'")).rejects.toThrow(
    'immuable',
  )
  await expect(db.exec('delete from decisions_paiements')).rejects.toThrow('immuable')
  await db.query<Record<string, unknown>>('delete from dossiers where id=$1', [dossier])
  expect(
    (await db.query<Record<string, unknown>>('select operation from decisions_paiements')).rows,
  ).toEqual([{ operation }])
})
test('les roles applicatifs ne lisent ni ne consignent une decision', async () => {
  const c = await configuration()
  await consignerDecision(db, c)
  for (const role of [
    'anon',
    'authenticated',
    'service_role',
    'porteur_lien',
    'serveur',
    'depot_piece',
  ]) {
    await db.exec(`set role ${role}`)
    try {
      await expect(
        db.query<Record<string, unknown>>('select * from decisions_paiements'),
      ).rejects.toThrow(/permission denied/)
      await expect(consignerDecision(db, { ...c, operation: dossier })).rejects.toThrow(
        'Decision non enregistree',
      )
    } finally {
      await db.exec('reset role')
    }
  }
})
test('la RLS reste fermee meme avec un droit SELECT accidentel', async () => {
  await consignerDecision(db, await configuration())
  await db.exec('grant select on decisions_paiements to authenticated; set role authenticated')
  try {
    expect(
      (await db.query<Record<string, unknown>>('select * from decisions_paiements')).rows,
    ).toEqual([])
  } finally {
    await db.exec('reset role; revoke select on decisions_paiements from authenticated')
  }
})
test('une session inconnue ne peut recevoir une decision', async () => {
  const c = await configuration()
  c.rapport = envelopper({ ...JSON.parse(c.rapport.contenu), reference_session: 'cs_absente' })
  await expect(consignerDecision(db, c)).rejects.toThrow('Decision non enregistree')
  expect(
    (await db.query<Record<string, unknown>>('select * from decisions_paiements')).rows,
  ).toEqual([])
})

test('le diagnostic retrouve les decisions meme apres disparition des autres donnees', async () => {
  await consignerDecision(db, await configuration())
  await db.exec(
    'delete from dossiers; delete from evenements_paiements; delete from rapprochements_paiements; delete from registre_paiements',
  )
  const diagnostic = await diagnostiquerPaiement(db, 'cs_decision')
  expect(diagnostic.decisions).toHaveLength(1)
  expect(diagnostic.decisions[0]).toMatchObject({ operation, operateur, decision: 'a_examiner' })
  expect(diagnostic.registre).toEqual([])
  expect(diagnostic.reservation).toEqual([])
  expect((await db.query<Record<string, unknown>>('select * from dossiers')).rows).toEqual([])
})
test.each([
  'contenu',
  'hash',
  'format',
  'date',
  'reference',
  'operation',
  'decision',
  'connexion',
  'taille',
])('une configuration %s incoherente est refusee avant la base', async (cas) => {
  const c = await configuration()
  if (cas === 'contenu') c.rapport.contenu += ' '
  if (cas === 'hash') c.rapport.sha256 = 'f'.repeat(64)
  if (cas === 'taille') {
    c.rapport.contenu = ' '.repeat(4 * 1024 * 1024) + c.rapport.contenu
    c.rapport.sha256 = createHash('sha256').update(c.rapport.contenu).digest('hex')
  }
  if (cas === 'format') c.rapport.format = 'autre'
  if (cas === 'date')
    c.rapport = envelopper({
      ...JSON.parse(c.rapport.contenu),
      observe_le: new Date(Date.now() + 600000).toISOString(),
    })
  if (cas === 'reference')
    c.rapport = envelopper({ ...JSON.parse(c.rapport.contenu), reference_session: 'autre' })
  if (cas === 'operation') c.operation = 'invalide'
  if (cas === 'decision') c.decision = 'rembourser'
  if (cas === 'connexion') c.connexion += '?sslmode=disable'
  const query = vi.fn()
  await expect(consignerDecision({ query }, c)).rejects.toThrow()
  expect(query).not.toHaveBeenCalled()
})

test('le lanceur ne journalise pas une configuration privee refusee', async () => {
  const c = await configuration()
  c.connexion = 'postgres://fictif:PRIVE_CLE@localhost/cloison_audit_test'
  c.rapport.sha256 = 'invalide'
  const resultat = spawnSync(process.execPath, ['scripts/consigner-decision-paiement.mjs'], {
    input: JSON.stringify(c),
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true,
  })
  expect(resultat.status).toBe(1)
  expect(resultat.stdout).toBe('')
  expect(resultat.stderr.trim()).toBe(
    'Decision indisponible ; aucune donnee financiere journalisee.',
  )
})
test('une observation ancienne reste consignée comme telle, sans devenir une observation actuelle', async () => {
  const c = await configuration()
  c.rapport = envelopper({
    ...JSON.parse(c.rapport.contenu),
    observe_le: '2020-01-01T00:00:00.000Z',
  })
  expect(configurationDecision(c).observeLe).toBe('2020-01-01T00:00:00.000Z')
  await consignerDecision(db, c)
  const ligne = (
    await db.query<Record<string, unknown>>(
      'select rapport_observe_le,inscrit_le from decisions_paiements',
    )
  ).rows[0]
  expect(new Date(String(ligne?.rapport_observe_le)).getFullYear()).toBe(2020)
  expect(new Date(String(ligne?.inscrit_le)).getFullYear()).toBeGreaterThan(2020)
})
