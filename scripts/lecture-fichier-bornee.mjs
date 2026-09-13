import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'

/** Lit au plus maximum + 1 octets, meme si le fichier grossit apres stat(). */
export async function lireFichierBorne(chemin, maximum) {
  if (!Number.isSafeInteger(maximum) || maximum < 0 || maximum >= Number.MAX_SAFE_INTEGER)
    throw new Error('Limite de lecture invalide.')
  if (!(await lstat(chemin)).isFile()) throw new Error('Fichier non regulier refuse.')
  const fichier = await open(
    chemin,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const stat = await fichier.stat()
    if (!stat.isFile() || stat.size > maximum) throw new Error('Fichier refuse ou trop volumineux.')
    const blocs = []
    let position = 0
    for (;;) {
      const bloc = Buffer.alloc(Math.min(64 * 1024, maximum + 1 - position))
      const { bytesRead } = await fichier.read(bloc, 0, bloc.length, position)
      if (!bytesRead) return Buffer.concat(blocs, position)
      position += bytesRead
      if (position > maximum) throw new Error('Fichier trop volumineux.')
      blocs.push(bloc.subarray(0, bytesRead))
    }
  } finally {
    await fichier.close()
  }
}
