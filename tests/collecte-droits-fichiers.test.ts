import { beforeEach, afterEach, describe, test, expect, vi } from 'vitest'
import {
  mkdtemp,
  realpath,
  writeFile,
  readFile,
  chmod,
  rm,
  access,
  stat,
  symlink,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { ecrireCollecteDroits } from '../scripts/collecter-donnees-droits.mjs'

let dossier: string
const chemin = (nom: string) => join(dossier, nom)
beforeEach(async () => {
  dossier = await mkdtemp(join(await realpath(tmpdir()), 'cloison-collecte-'))
  await writeFile(chemin('decision.json'), '{}', { mode: 0o600 })
})
afterEach(async () => {
  await rm(dossier, { force: true, recursive: true })
})
const produire = () => Promise.resolve({ prive: 'donnees personnelles fictives' })
const verifier = () => Promise.resolve()
const executer = (controle = verifier) =>
  ecrireCollecteDroits(chemin('decision.json'), chemin('source.json'), produire, controle)

describe.skipIf(!['linux', 'darwin'].includes(process.platform))('Copie de travail privee', () => {
  test('refuse un encodage invalide avant toute collecte', async () => {
    await writeFile(chemin('decision.json'), Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125]))
    const collecter = vi.fn(produire)
    await expect(
      ecrireCollecteDroits(chemin('decision.json'), chemin('source.json'), collecter, verifier),
    ).rejects.toThrow()
    expect(collecter).not.toHaveBeenCalled()
  })
  test('ecrit en 0600 et ne renvoie que taille et empreinte', async () => {
    const r = await executer()
    expect(Object.keys(r).sort()).toEqual(['sha256', 'taille'])
    expect(JSON.parse(await readFile(chemin('source.json'), 'utf8'))).toEqual(await produire())
    expect((await stat(chemin('source.json'))).mode & 0o777).toBe(0o600)
  })
  test('ne remplace jamais une sortie existante', async () => {
    await writeFile(chemin('source.json'), 'intact', { mode: 0o600 })
    await expect(executer()).rejects.toThrow()
    expect(await readFile(chemin('source.json'), 'utf8')).toBe('intact')
  })
  test('refuse un repertoire partage avant toute collecte', async () => {
    await chmod(dossier, 0o755)
    const collecter = vi.fn(produire)
    await expect(
      ecrireCollecteDroits(chemin('decision.json'), chemin('source.json'), collecter, verifier),
    ).rejects.toThrow()
    expect(collecter).not.toHaveBeenCalled()
  })
  test('refuse une decision lisible par les tiers', async () => {
    await chmod(chemin('decision.json'), 0o644)
    await expect(executer()).rejects.toThrow()
    await expect(access(chemin('source.json'))).rejects.toThrow()
  })
  test('refuse une decision remplacee pendant la collecte', async () => {
    await expect(
      ecrireCollecteDroits(
        chemin('decision.json'),
        chemin('source.json'),
        async () => {
          await writeFile(chemin('decision.json'), '{"autre":true}')
          return produire()
        },
        verifier,
      ),
    ).rejects.toThrow()
    await expect(access(chemin('source.json'))).rejects.toThrow()
  })
  test('retire la copie si le suivi change apres ecriture', async () => {
    const controle = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Revision changee'))
    await expect(executer(controle)).rejects.toThrow()
    expect(controle).toHaveBeenCalledTimes(2)
    await expect(access(chemin('source.json'))).rejects.toThrow()
  })
  test('ne suit pas les liens symboliques', async () => {
    await symlink(chemin('decision.json'), chemin('lien.json'))
    await expect(
      ecrireCollecteDroits(chemin('lien.json'), chemin('source.json'), produire, verifier),
    ).rejects.toThrow()
  })
  test('refuse une sortie trop volumineuse sans creer de fichier', async () => {
    await expect(
      ecrireCollecteDroits(
        chemin('decision.json'),
        chemin('source.json'),
        async () => 'x'.repeat(4 * 1024 * 1024),
        verifier,
      ),
    ).rejects.toThrow()
    await expect(access(chemin('source.json'))).rejects.toThrow()
  })
})
test.skipIf(['linux', 'darwin'].includes(process.platform))(
  'refuse Windows avant lecture de decision ou authentifiant',
  async () => {
    const collecter = vi.fn(produire)
    await expect(ecrireCollecteDroits('absent', 'absent', collecter, verifier)).rejects.toThrow(
      'indisponible sur ce systeme',
    )
    expect(collecter).not.toHaveBeenCalled()
    const r = spawnSync(
      process.execPath,
      [resolve('scripts/collecter-donnees-droits.mjs'), 'absent', 'absent'],
      { input: 'authentifiant-prive-fictif', encoding: 'utf8', timeout: 15000 },
    )
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).not.toContain('authentifiant-prive-fictif')
  },
)
