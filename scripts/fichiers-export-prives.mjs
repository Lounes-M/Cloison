import { constants } from 'node:fs'
import { open, lstat, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
const refuser = () => {
  throw new Error('Export personnel refuse.')
}
export function systemeSupporte() {
  return (
    ['linux', 'darwin'].includes(process.platform) &&
    Number.isInteger(constants.O_NOFOLLOW) &&
    constants.O_NOFOLLOW > 0 &&
    Number.isInteger(constants.O_NONBLOCK) &&
    constants.O_NONBLOCK > 0
  )
}
export function verifierSysteme() {
  if (!systemeSupporte()) throw new Error('Export personnel indisponible sur ce systeme.')
}
export async function parentsDirects(chemin) {
  let courant = resolve(chemin)
  for (;;) {
    const stat = await lstat(courant)
    if (!stat.isDirectory() || stat.isSymbolicLink()) refuser()
    const parent = dirname(courant)
    if (parent === courant) return
    courant = parent
  }
}
export async function repertoirePrive(chemin) {
  await parentsDirects(chemin)
  if (((await lstat(chemin)).mode & 0o077) !== 0) refuser()
}
export async function lireBorne(chemin, maximum) {
  await parentsDirects(dirname(resolve(chemin)))
  const f = await open(chemin, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = await f.stat()
    if (!stat.isFile() || stat.size > maximum || (stat.mode & 0o077) !== 0) refuser()
    // Lecture bornee meme si le fichier grossit apres stat(). Pas de readFile illimite.
    const blocs = []
    let position = 0
    while (position <= maximum) {
      const bloc = Buffer.alloc(Math.min(64 * 1024, maximum + 1 - position))
      const { bytesRead } = await f.read(bloc, 0, bloc.length, position)
      if (!bytesRead) break
      position += bytesRead
      if (position > maximum) refuser()
      blocs.push(bloc.subarray(0, bytesRead))
    }
    return Buffer.concat(blocs)
  } finally {
    await f.close()
  }
}
export async function ecrireNeuf(chemin, octets) {
  const f = await open(chemin, 'wx', 0o600)
  try {
    await f.writeFile(octets)
    await f.sync()
  } catch (erreur) {
    await rm(chemin, { force: true })
    throw erreur
  } finally {
    await f.close()
  }
}
