import { constants, fstatSync, readSync } from 'node:fs'
import { open, lstat, mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { creerPaquetDroits, ouvrirPaquetDroits, verifierDecisionPaquet } from './paquet-droits.mjs'

const refuser = () => {
  throw new Error('Export personnel refuse.')
}
async function parentsDirects(chemin) {
  let courant = resolve(chemin)
  for (;;) {
    const stat = await lstat(courant)
    if (!stat.isDirectory() || stat.isSymbolicLink()) refuser()
    const parent = dirname(courant)
    if (parent === courant) return
    courant = parent
  }
}
async function repertoirePrive(chemin) {
  await parentsDirects(chemin)
  if (((await lstat(chemin)).mode & 0o077) !== 0) refuser()
}
async function lireBorne(chemin, maximum) {
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
async function ecrireNeuf(chemin, octets) {
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

/** Outil hors ligne. Le repertoire prive doit etre reserve a l'operateur. */
export async function exporterDroits(commande, decisionPath, source, destination, cle) {
  if (!['creer', 'extraire'].includes(commande)) refuser()
  const decision = verifierDecisionPaquet(
    JSON.parse((await lireBorne(decisionPath, 256 * 1024)).toString('utf8')),
  )
  await repertoirePrive(dirname(resolve(destination)))
  const reverifier = async () => {
    const actuelle = verifierDecisionPaquet(
      JSON.parse((await lireBorne(decisionPath, 256 * 1024)).toString('utf8')),
    )
    if (JSON.stringify(actuelle) !== JSON.stringify(decision)) refuser()
  }
  if (commande === 'creer') {
    await repertoirePrive(source)
    const fichiers = new Map()
    for (const f of decision.fichiers)
      fichiers.set(f.nom, await lireBorne(join(source, f.nom), f.taille))
    const archive = creerPaquetDroits(decision, fichiers, cle)
    await reverifier()
    await ecrireNeuf(destination, archive)
    try {
      await reverifier()
    } catch (erreur) {
      await rm(destination, { force: true })
      throw erreur
    }
    return {
      fichiers: fichiers.size,
      sha256: createHash('sha256').update(archive).digest('hex'),
    }
  }
  const { fichiers } = ouvrirPaquetDroits(await lireBorne(source, 90 * 1024 * 1024), cle, decision)
  await reverifier()
  // Aucune destination n'existe avant la validation de tous les contenus.
  await mkdir(destination, { mode: 0o700 })
  try {
    for (const [nom, contenu] of fichiers) await ecrireNeuf(join(destination, nom), contenu)
    await ecrireNeuf(join(destination, 'manifeste.json'), Buffer.from(JSON.stringify(decision)))
    await reverifier()
  } catch (erreur) {
    await rm(destination, { recursive: true, force: true })
    throw erreur
  }
  return { fichiers: fichiers.size }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let cle
  try {
    if (process.argv.length !== 6) refuser()
    const stat = fstatSync(3)
    if (!stat.isFile() || stat.size !== 32 || (stat.mode & 0o077) !== 0) refuser()
    cle = Buffer.alloc(32)
    if (readSync(3, cle, 0, 32, 0) !== 32) refuser()
    const [commande, decision, source, destination] = process.argv.slice(2)
    console.log(JSON.stringify(await exporterDroits(commande, decision, source, destination, cle)))
  } catch {
    console.error(
      'Export personnel refuse. Verifier decision, fichiers, cle et repertoires prives.',
    )
    process.exitCode = 1
  } finally {
    cle?.fill(0)
  }
}
