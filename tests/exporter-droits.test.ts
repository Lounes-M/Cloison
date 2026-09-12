import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  mkdtemp,
  realpath,
  writeFile,
  readFile,
  chmod,
  mkdir,
  rm,
  stat,
  symlink,
  access,
} from 'node:fs/promises'
import { openSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exporterDroits } from '../scripts/exporter-droits.mjs'
import type { DecisionPaquet } from '../scripts/paquet-droits.mjs'

let racine: string
let decision: DecisionPaquet
const cle = randomBytes(32)
const contenu = Buffer.from('Identite et contenu fictifs confidentiels')
const chemin = (nom: string) => join(racine, nom)
async function sauverDecision() {
  await writeFile(chemin('decision.json'), JSON.stringify(decision), { mode: 0o600 })
}
const creer = () =>
  exporterDroits('creer', chemin('decision.json'), chemin('source'), chemin('paquet'), cle)
const extraire = () =>
  exporterDroits('extraire', chemin('decision.json'), chemin('paquet'), chemin('sortie'), cle)
beforeEach(async () => {
  racine = await mkdtemp(join(await realpath(tmpdir()), 'cloison-droits-'))
  await mkdir(chemin('source'), { mode: 0o700 })
  await writeFile(chemin('source/donnees-0001.txt'), contenu, { mode: 0o600 })
  decision = {
    version: 1,
    demande: randomUUID(),
    revision: randomUUID(),
    decisionSha256: 'a'.repeat(64),
    destinataireSha256: 'b'.repeat(64),
    creeLe: new Date(Date.now() - 60000).toISOString(),
    expireLe: new Date(Date.now() + 60000).toISOString(),
    exclusions: ['tiers'],
    fichiers: [
      {
        nom: 'donnees-0001.txt',
        taille: contenu.length,
        sha256: createHash('sha256').update(contenu).digest('hex'),
      },
    ],
  }
  await sauverDecision()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(racine, { recursive: true, force: true })
})

describe('Export personnel hors ligne', () => {
  it('cree et extrait exclusivement les fichiers approuves dans des destinations privees', async () => {
    await writeFile(chemin('source/ne-pas-exporter.txt'), 'secret tiers', { mode: 0o600 })
    expect((await creer()).fichiers).toBe(1)
    expect((await stat(chemin('paquet'))).mode & 0o777).toBe(0o600)
    expect(await extraire()).toEqual({ fichiers: 1 })
    expect((await stat(chemin('sortie'))).mode & 0o777).toBe(0o700)
    expect((await stat(chemin('sortie/donnees-0001.txt'))).mode & 0o777).toBe(0o600)
    expect(await readFile(chemin('sortie/donnees-0001.txt'))).toEqual(contenu)
    expect(JSON.parse(await readFile(chemin('sortie/manifeste.json'), 'utf8'))).toEqual(decision)
    await expect(access(chemin('sortie/ne-pas-exporter.txt'))).rejects.toThrow()
  })
  it('ne remplace jamais une archive ou un repertoire existant', async () => {
    await creer()
    const archive = await readFile(chemin('paquet'))
    await expect(creer()).rejects.toThrow()
    expect(await readFile(chemin('paquet'))).toEqual(archive)
    await mkdir(chemin('sortie'))
    await writeFile(chemin('sortie/conserver'), 'conserver')
    await expect(extraire()).rejects.toThrow()
    expect(await readFile(chemin('sortie/conserver'), 'utf8')).toBe('conserver')
  })
  it.each(['decision.json', 'source/donnees-0001.txt', 'source', '.'])(
    'refuse les permissions publiques de %s',
    async (nom) => {
      await chmod(chemin(nom), 0o755)
      await expect(creer()).rejects.toThrow()
      await expect(access(chemin('paquet'))).rejects.toThrow()
    },
  )
  it('refuse un lien symbolique vers un contenu pourtant approuve', async () => {
    await writeFile(chemin('original'), contenu, { mode: 0o600 })
    await rm(chemin('source/donnees-0001.txt'))
    await symlink(chemin('original'), chemin('source/donnees-0001.txt'))
    await expect(creer()).rejects.toThrow()
  })
  it('refuse un repertoire source symbolique', async () => {
    await symlink(chemin('source'), chemin('alias'))
    await expect(
      exporterDroits('creer', chemin('decision.json'), chemin('alias'), chemin('paquet'), cle),
    ).rejects.toThrow()
  })
  it('refuse un fichier plus long que celui approuve avant de creer la destination', async () => {
    await writeFile(chemin('source/donnees-0001.txt'), Buffer.alloc(contenu.length + 1))
    await expect(creer()).rejects.toThrow()
    await expect(access(chemin('paquet'))).rejects.toThrow()
  })
  it('refuse un fichier tronque ou modifie de meme longueur', async () => {
    for (const taille of [contenu.length - 1, contenu.length]) {
      await writeFile(chemin('source/donnees-0001.txt'), Buffer.alloc(taille))
      await expect(creer()).rejects.toThrow()
    }
  })
  it('refuse une revision remplacee sans ecrire les contenus en clair', async () => {
    await creer()
    decision.revision = randomUUID()
    await sauverDecision()
    await expect(extraire()).rejects.toThrow()
    await expect(access(chemin('sortie'))).rejects.toThrow()
  })
  it('refuse une archive alteree avant de creer le repertoire', async () => {
    await creer()
    const archive = await readFile(chemin('paquet'))
    archive[archive.length - 1]! ^= 1
    await writeFile(chemin('paquet'), archive)
    await expect(extraire()).rejects.toThrow()
    await expect(access(chemin('sortie'))).rejects.toThrow()
  })
  it.each(['creer', 'extraire'])(
    'nettoie la destination si la decision expire pendant %s',
    async (commande) => {
      if (commande === 'extraire') await creer()
      const debut = Date.now()
      const fin = Date.parse(decision.expireLe)
      vi.spyOn(Date, 'now')
        .mockReturnValue(fin)
        .mockReturnValueOnce(debut)
        .mockReturnValueOnce(debut)
        .mockReturnValueOnce(debut)
      await expect(commande === 'creer' ? creer() : extraire()).rejects.toThrow()
      await expect(access(chemin(commande === 'creer' ? 'paquet' : 'sortie'))).rejects.toThrow()
    },
  )

  it('execute le vrai CLI avec une cle sur fd 3 sans publier de donnees dans les logs', async () => {
    await writeFile(chemin('cle'), cle, { mode: 0o600 })
    const fd = openSync(chemin('cle'), 'r')
    try {
      const resultat = spawnSync(
        process.execPath,
        [
          resolve('scripts/exporter-droits.mjs'),
          'creer',
          chemin('decision.json'),
          chemin('source'),
          chemin('paquet'),
        ],
        {
          stdio: ['ignore', 'pipe', 'pipe', fd],
          encoding: 'utf8',
        },
      )
      expect(resultat.status, resultat.stderr).toBe(0)
      expect(JSON.parse(resultat.stdout)).toEqual({
        fichiers: 1,
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
      expect(resultat.stderr).not.toContain(contenu.toString())
      expect(resultat.stderr).not.toContain(decision.demande)
      expect(resultat.stdout).not.toContain(contenu.toString())
      expect(resultat.stdout).not.toContain(decision.demande)
    } finally {
      closeSync(fd)
    }
  })
  it('refuse le vrai CLI sans cle et ne journalise aucun chemin prive', () => {
    const resultat = spawnSync(
      process.execPath,
      [
        resolve('scripts/exporter-droits.mjs'),
        'creer',
        chemin('decision.json'),
        chemin('source'),
        chemin('paquet'),
      ],
      { encoding: 'utf8' },
    )
    expect(resultat.status).toBe(1)
    expect(resultat.stdout).toBe('')
    expect(resultat.stderr).not.toContain(racine)
    expect(resultat.stderr).toContain('Export personnel refuse.')
  })
})
