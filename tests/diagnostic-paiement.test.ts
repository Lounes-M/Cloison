import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { mkdtemp, readFile, rm, stat, symlink, writeFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { baseDEssai } from './base'
import { diagnostiquerPaiement } from '../scripts/diagnostic-paiement.mjs'
import { configurationDiagnostic, ecrireDiagnostic } from '../scripts/examiner-paiement.mjs'

let db: PGlite
let dossierPrive: string
const dossier = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const config = {
  connexion: 'postgres://fictif@localhost/cloison_audit_test',
  destination: '/inutilise',
  reference: 'cs_fictif',
}
beforeAll(async () => {
  db = await baseDEssai()
  dossierPrive = await mkdtemp(join(tmpdir(), 'cloison-diagnostic-'))
})
afterAll(async () => {
  await db.close()
  await rm(dossierPrive, { recursive: true, force: true })
})
beforeEach(async () => {
  await db.exec(`delete from rapprochements_paiements; delete from evenements_paiements;
    delete from registre_paiements; delete from sessions_paiement; delete from dossiers`)
  await db.query(
    "insert into dossiers(id,email_locataire) values ($1,'CONFIDENTIEL@example.invalid')",
    [dossier],
  )
  await db.query("insert into sessions_paiement(dossier_id,session_ref) values ($1,'cs_fictif')", [
    dossier,
  ])
  await db.query(
    `select enregistrer_paiement_locataire('evt_fictif','cs_fictif','pi_fictif',$1,900,
    'eur','locataire-2026-09-04',now())`,
    [dossier],
  )
})
test('le rapport cible la session, sans courriel, jeton, piece ni dossier voisin', async () => {
  await db.query(`insert into evenements_paiements(id,nature,reference_objet,reference_paiement,montant_cents,devise,survenu_le)
    values ('evt_voisin','paiement','cs_voisin','pi_voisin',900,'eur',now())`)
  const avant = await db.query('select etat_paiements() as etat')
  const r = await diagnostiquerPaiement(db, 'cs_fictif')
  expect(r.registre[0]).toMatchObject({ marque: true, montant_cents: 900 })
  expect(r.evenements.map((e) => e.id)).toEqual(['evt_fictif'])
  expect(r.tarifs).toEqual([{ version: 'locataire-2026-09-04', montant_cents: 900, devise: 'eur' }])
  expect(JSON.stringify(r)).not.toMatch(/CONFIDENTIEL|evt_voisin|tentative"|jeton|piece/)
  expect((await db.query('select etat_paiements() as etat')).rows).toEqual(avant.rows)
})
test('un suivi precedant le paiement et un dossier purge restent examinables', async () => {
  await db.query(`insert into evenements_paiements(id,nature,reference_objet,reference_paiement,reference_session,montant_cents,devise,survenu_le)
    values ('evt_suivi','remboursement','ch_fictif','pi_suivi','cs_suivi',900,'eur',now())`)
  expect((await diagnostiquerPaiement(db, 'cs_suivi')).evenements[0]?.id).toBe('evt_suivi')
  await db.query('delete from dossiers where id=$1', [dossier])
  const r = await diagnostiquerPaiement(db, 'cs_fictif')
  expect(r.reservation).toEqual([])
  expect(r.registre[0]).toMatchObject({ dossier_id: null, source_dossier: dossier })
  expect((await db.query('select id from dossiers')).rows).toEqual([])
})
test('une ancienne reference observee conserve ses suivis et ses conflits', async () => {
  await db.query(`insert into rapprochements_paiements(reference_session,reference_paiement,montant_cents,devise,paye)
    values ('cs_fictif','pi_ancien',900,'eur',true)`)
  await db.query(`insert into evenements_paiements(id,nature,reference_objet,reference_paiement,montant_cents,devise,survenu_le)
    values ('evt_remb','remboursement','ch_ancien','pi_ancien',500,'eur',now())`)
  await db.query(
    `insert into registre_paiements(reference_session,reference_paiement,source_dossier,montant_cents,devise,tarif_version,survenu_le)
    values ('cs_collision','pi_ancien',$1,900,'eur','locataire-2026-09-04',now())`,
    [dossier],
  )
  const r = await diagnostiquerPaiement(db, 'cs_fictif')
  expect(r.evenements.map((e) => e.id)).toContain('evt_remb')
  expect(r.sessions_associees[0]?.reference_session).toBe('cs_collision')
})
test('une requete accidentellement mutante est refusee par PostgreSQL', async () => {
  const espion = {
    async query(sql: string, params?: unknown[]) {
      if (sql.startsWith('select transaction_timestamp'))
        await db.query('delete from registre_paiements')
      return db.query<Record<string, unknown>>(sql, params)
    },
  }
  await expect(diagnostiquerPaiement(espion, 'cs_fictif')).rejects.toThrow(/read-only/)
  expect((await db.query('select reference_session from registre_paiements')).rows).toHaveLength(1)
  expect((await db.query('show transaction_read_only')).rows[0]).toEqual({
    transaction_read_only: 'off',
  })
})
test('un role applicatif ne peut pas utiliser le diagnostic administratif', async () => {
  for (const role of ['anon', 'authenticated', 'porteur_lien', 'serveur']) {
    await db.exec(`set role ${role}`)
    try {
      await expect(diagnostiquerPaiement(db, 'cs_fictif')).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec('reset role')
    }
  }
})
test('la reference est validee avant toute requete', async () => {
  const query = vi.fn()
  await expect(diagnostiquerPaiement({ query }, "cs_x'; delete from dossiers;--")).rejects.toThrow()
  expect(query).not.toHaveBeenCalled()
})
test('une session inconnue ou un historique excessif ne produit pas de rapport partiel', async () => {
  await expect(diagnostiquerPaiement(db, 'cs_absent')).rejects.toThrow('Session inconnue')
  await db.query(`insert into evenements_paiements(id,nature,reference_objet,reference_paiement,montant_cents,devise,survenu_le)
    select 'evt_limite_'||n,'remboursement','ch_fictif','pi_fictif',1,'eur',now() from generate_series(1,501) n`)
  await expect(diagnostiquerPaiement(db, 'cs_fictif')).rejects.toThrow('Historique trop volumineux')
  expect((await db.query('show transaction_read_only')).rows[0]).toEqual({
    transaction_read_only: 'off',
  })
})
test.skipIf(!process.getuid)(
  'le rapport prive a une empreinte verifiable et necrase aucun fichier',
  async () => {
    const chemin = join(dossierPrive, 'rapport.json')
    const r = await diagnostiquerPaiement(db, 'cs_fictif')
    await ecrireDiagnostic(chemin, r)
    const rapport = JSON.parse(await readFile(chemin, 'utf8'))
    expect(rapport.sha256).toBe(createHash('sha256').update(rapport.contenu).digest('hex'))
    expect(JSON.parse(rapport.contenu).reference_session).toBe('cs_fictif')
    expect((await stat(chemin)).mode & 0o777).toBe(0o600)
    await expect(ecrireDiagnostic(chemin, { modifie: true })).rejects.toThrow()
    expect(JSON.parse(await readFile(chemin, 'utf8'))).toEqual(rapport)
  },
)
test.skipIf(!process.getuid)(
  'une destination publique ou un lien ne recoit pas de donnees financieres',
  async () => {
    const publicDir = await mkdtemp(join(tmpdir(), 'cloison-public-'))
    try {
      await chmod(publicDir, 0o755)
      await expect(ecrireDiagnostic(join(publicDir, 'rapport'), {})).rejects.toThrow(
        'Repertoire prive',
      )
      const cible = join(dossierPrive, 'cible')
      const lien = join(dossierPrive, 'lien')
      await writeFile(cible, 'intact')
      await symlink(cible, lien)
      await expect(ecrireDiagnostic(lien, {})).rejects.toThrow()
      expect(await readFile(cible, 'utf8')).toBe('intact')
    } finally {
      await rm(publicDir, { recursive: true, force: true })
    }
  },
)
test.each(['?sslmode=disable', '?sslmode=no-verify', '#fragment'])(
  'les options TLS injectees %s sont refusees',
  (suffixe) => {
    expect(() =>
      configurationDiagnostic({
        ...config,
        connexion: 'postgres://fictif@db.example.invalid/base' + suffixe,
      }),
    ).toThrow()
  },
)
test('un hote distant reste distant et les extensions de configuration sont refusees', () => {
  expect(
    configurationDiagnostic({ ...config, connexion: 'postgres://fictif@db.example.invalid/base' })
      .locale,
  ).toBe(false)
  expect(() => configurationDiagnostic({ ...config, ssl: false })).toThrow()
})
test('le lanceur ne revele jamais une configuration invalide', () => {
  const r = spawnSync(process.execPath, [resolve('scripts/examiner-paiement.mjs')], {
    input: JSON.stringify({ connexion: 'SECRET-CONNEXION-PRIVEE', reference: 'cs_CONFIDENTIEL' }),
    encoding: 'utf8',
    timeout: 10000,
  })
  expect(r.status).toBe(1)
  expect(r.stdout).toBe('')
  expect(r.stderr).not.toMatch(/SECRET|CONFIDENTIEL/)
  expect(r.stderr).toContain('Diagnostic indisponible')
})
test.skipIf(!process.getuid)('un rapport trop gros ne cree pas de fichier', async () => {
  const chemin = join(dossierPrive, 'excessif')
  await expect(ecrireDiagnostic(chemin, 'x'.repeat(4 * 1024 * 1024))).rejects.toThrow(
    'Rapport trop volumineux',
  )
  await expect(stat(chemin)).rejects.toThrow()
})

test('sans uid POSIX aucun rapport ne peut etre ecrit ou remplace', async () => {
  const nouveau = join(dossierPrive, 'sans-uid-nouveau')
  const existant = join(dossierPrive, 'sans-uid-existant')
  await writeFile(existant, 'intact')
  vi.stubGlobal('process', { ...process, getuid: undefined })
  try {
    for (const chemin of [nouveau, existant]) {
      await expect(ecrireDiagnostic(chemin, {})).rejects.toThrow('Repertoire prive obligatoire')
    }
  } finally {
    vi.unstubAllGlobals()
  }
  await expect(stat(nouveau)).rejects.toThrow()
  expect(await readFile(existant, 'utf8')).toBe('intact')
})
