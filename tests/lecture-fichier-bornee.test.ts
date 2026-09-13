import { mkdtemp, writeFile, rm, realpath, open, truncate, symlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import type * as FsPromises from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, test, vi } from 'vitest'
import { lireFichierBorne } from '../scripts/lecture-fichier-bornee.mjs'

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof FsPromises>()
  return { ...original, open: vi.fn(original.open) }
})
const fsReel = await vi.importActual<typeof FsPromises>('node:fs/promises')
const repertoires: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.mocked(open).mockReset().mockImplementation(fsReel.open)
  for (const repertoire of repertoires.splice(0))
    await rm(repertoire, { recursive: true, force: true })
})
async function preparer(taille: number) {
  const repertoire = await mkdtemp(join(await realpath(tmpdir()), 'cloison-lecture-bornee-'))
  repertoires.push(repertoire)
  const chemin = join(repertoire, 'fichier')
  const contenu = Buffer.alloc(taille, 42)
  await writeFile(chemin, contenu)
  return { chemin, repertoire, contenu }
}

for (const taille of [0, 1, 65535, 65536, 65537, 131073]) {
  test(`lit exactement ${taille} octets a la limite autorisee`, async () => {
    const { chemin, contenu } = await preparer(taille)
    expect(await lireFichierBorne(chemin, taille)).toEqual(contenu)
  })
}

test('refuse un fichier deja trop grand avant toute lecture et ferme le descripteur', async () => {
  const { chemin } = await preparer(33)
  const fichier = await fsReel.open(chemin, 'r')
  const lecture = vi.spyOn(fichier, 'read')
  vi.mocked(open).mockResolvedValueOnce(fichier)
  await expect(lireFichierBorne(chemin, 32)).rejects.toThrow('volumineux')
  expect(lecture).not.toHaveBeenCalled()
  expect(fichier.fd).toBe(-1)
})

for (const croissance of ['apres-stat', 'pendant-lecture'] as const) {
  test(`borne les octets reellement lus quand le fichier grossit ${croissance}`, async () => {
    const maximum = 65536
    const { chemin } = await preparer(1)
    const fichier = await fsReel.open(chemin, 'r')
    const statReel = fichier.stat.bind(fichier)
    if (croissance === 'apres-stat') {
      vi.spyOn(fichier, 'stat').mockImplementationOnce(async () => {
        const stat = await statReel()
        await truncate(chemin, maximum * 4)
        return stat
      })
    }
    const readReel = fichier.read.bind(fichier)
    let lus = 0
    let appels = 0
    fichier.read = (async (buffer: Buffer, offset: number, length: number, position: number) => {
      const resultat = await readReel(buffer, offset, length, position)
      lus += resultat.bytesRead
      if (++appels === 1 && croissance === 'pendant-lecture') await truncate(chemin, maximum * 4)
      return resultat
    }) as FileHandle['read']
    // Observe aussi l'ancienne lecture entiere pour que la contre-preuve mesure
    // les octets charges, et non simplement le choix d'une API.
    const readFileReel = fichier.readFile.bind(fichier)
    fichier.readFile = (async () => {
      if (croissance === 'pendant-lecture') await truncate(chemin, maximum * 4)
      const contenu = await readFileReel()
      lus += contenu.length
      return contenu
    }) as FileHandle['readFile']
    vi.mocked(open).mockResolvedValueOnce(fichier)
    await expect(lireFichierBorne(chemin, maximum)).rejects.toThrow('volumineux')
    expect(lus).toBeGreaterThan(maximum)
    expect(lus).toBeLessThanOrEqual(maximum + 1)
    expect(fichier.fd).toBe(-1)
  })
}

test('ferme le fichier apres une erreur de lecture', async () => {
  const { chemin } = await preparer(1)
  const fichier = await fsReel.open(chemin, 'r')
  vi.spyOn(fichier, 'read').mockRejectedValueOnce(new Error('Erreur de lecture fictive'))
  vi.mocked(open).mockResolvedValueOnce(fichier)
  await expect(lireFichierBorne(chemin, 1)).rejects.toThrow('Erreur de lecture fictive')
  expect(fichier.fd).toBe(-1)
})

test('refuse un repertoire et un lien symbolique', async () => {
  const { chemin, repertoire } = await preparer(1)
  await expect(lireFichierBorne(repertoire, 10)).rejects.toThrow('non regulier')
  const alias = join(repertoire, 'alias')
  if (process.platform === 'win32') await symlink(repertoire, alias, 'junction')
  else await symlink(chemin, alias)
  await expect(lireFichierBorne(alias, 10)).rejects.toThrow('non regulier')
})

for (const limite of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
  test(`refuse une limite invalide ${limite} avant ouverture`, async () => {
    await expect(lireFichierBorne('/inexistant', limite)).rejects.toThrow('Limite')
    expect(open).not.toHaveBeenCalled()
  })
}
