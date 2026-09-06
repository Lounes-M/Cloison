import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { openSync, closeSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, expect, test } from 'vitest'
import { nouvelleCle, sceller, ouvrir } from '../lib/coffre/enveloppe'
// @ts-expect-error Outil Node autonome execute avec Node 24.
import { sauvegarder, restaurer } from '../scripts/sauvegarde-locale.mjs'

const repertoires: string[] = []
afterEach(async () => {
  for (const repertoire of repertoires.splice(0))
    await rm(repertoire, { recursive: true, force: true })
})
async function preparer() {
  const racine = await mkdtemp(join(await realpath(tmpdir()), 'cloison-restauration-'))
  repertoires.push(racine)
  const source = join(racine, 'source')
  await mkdir(join(source, 'objets'), { recursive: true })
  await writeFile(join(source, 'base.dump'), 'base fictive')
  await writeFile(join(source, 'configuration.json'), '{"environnement":"exercice-local"}')
  return {
    racine,
    source,
    archive: join(racine, 'copie.cloison'),
    cible: join(racine, 'restauree'),
    cle: nouvelleCle(),
  }
}

test('restaure une vraie base PGlite et ouvre un objet avec une cle maitresse fictive conservee separement', async () => {
  const contexte = await preparer()
  const maitresse = nouvelleCle()
  const dek = nouvelleCle()
  const original = Buffer.from('Document exclusivement fictif pour exercice de restauration')
  const objet = sceller(original, dek)
  const base = new PGlite()
  try {
    await base.exec(
      'create table pieces (chemin text primary key, cle_scellee text not null, sha256 text not null)',
    )
    await base.query('insert into pieces values ($1, $2, $3)', [
      'piece.chiffree',
      sceller(dek, maitresse).toString('base64'),
      createHash('sha256').update(original).digest('hex'),
    ])
    await writeFile(
      join(contexte.source, 'base.dump'),
      Buffer.from(await (await base.dumpDataDir()).arrayBuffer()),
    )
  } finally {
    await base.close()
  }
  await writeFile(join(contexte.source, 'objets/piece.chiffree'), objet)
  const resultat = await sauvegarder(contexte.source, contexte.archive, contexte.cle)
  expect(resultat.fichiers).toBe(3)
  await rm(contexte.source, { recursive: true })
  await restaurer(contexte.archive, contexte.cible, contexte.cle)
  const restauree = new PGlite({
    loadDataDir: new Blob([new Uint8Array(await readFile(join(contexte.cible, 'base.dump')))]),
  })
  try {
    const { rows } = await restauree.query<{ chemin: string; cle_scellee: string; sha256: string }>(
      'select * from pieces',
    )
    expect(rows).toHaveLength(1)
    const piece = rows[0]!
    const cleRestauree = ouvrir(Buffer.from(piece.cle_scellee, 'base64'), maitresse)
    const contenu = ouvrir(
      await readFile(join(contexte.cible, 'objets', piece.chemin)),
      cleRestauree,
    )
    expect(contenu).toEqual(original)
    expect(createHash('sha256').update(contenu).digest('hex')).toBe(piece.sha256)
    expect(() => ouvrir(Buffer.from(piece.cle_scellee, 'base64'), nouvelleCle())).toThrow()
  } finally {
    await restauree.close()
  }
  expect((await stat(contexte.archive)).mode & 0o777).toBe(0o600)
  expect((await stat(contexte.cible)).mode & 0o777).toBe(0o700)
})

test('refuse mauvaise cle et archive alteree sans creer la destination', async () => {
  const c = await preparer()
  await sauvegarder(c.source, c.archive, c.cle)
  await expect(restaurer(c.archive, c.cible, nouvelleCle())).rejects.toThrow()
  await expect(stat(c.cible)).rejects.toThrow()
  const contenu = await readFile(c.archive)
  contenu[contenu.length - 1] = contenu[contenu.length - 1]! ^ 1
  await writeFile(c.archive, contenu)
  await expect(restaurer(c.archive, c.cible, c.cle)).rejects.toThrow()
  await expect(stat(c.cible)).rejects.toThrow()
})

test('refuse ecrasement de sauvegarde, de cible et liens symboliques', async () => {
  const c = await preparer()
  await sauvegarder(c.source, c.archive, c.cle)
  await expect(sauvegarder(c.source, c.archive, c.cle)).rejects.toThrow()
  await mkdir(c.cible)
  await writeFile(join(c.cible, 'temoin'), 'ne pas effacer')
  await expect(restaurer(c.archive, c.cible, c.cle)).rejects.toThrow()
  expect(await readFile(join(c.cible, 'temoin'), 'utf8')).toBe('ne pas effacer')
  await symlink(c.cible, join(c.racine, 'alias'))
  await expect(restaurer(c.archive, join(c.racine, 'alias/nouvelle'), c.cle)).rejects.toThrow()
  await symlink(join(c.cible, 'temoin'), join(c.source, 'objets/lien'))
  await expect(sauvegarder(c.source, join(c.racine, 'autre'), c.cle)).rejects.toThrow()
})

test('refuse chemins traversants, doublons et empreintes incorrectes meme dans un manifeste authentifie', async () => {
  const c = await preparer()
  await sauvegarder(c.source, c.archive, c.cle)
  const manifeste = JSON.parse(ouvrir(await readFile(c.archive), c.cle).toString())
  for (const fichiers of [
    [...manifeste.fichiers, { ...manifeste.fichiers[0], chemin: 'objets/../../sortie' }],
    [...manifeste.fichiers, manifeste.fichiers[0]],
    manifeste.fichiers.map((f: object) => ({ ...f, sha256: 'faux' })),
  ]) {
    await writeFile(
      c.archive,
      sceller(Buffer.from(JSON.stringify({ version: 1, fichiers })), c.cle),
    )
    await expect(restaurer(c.archive, c.cible, c.cle)).rejects.toThrow()
    await expect(stat(c.cible)).rejects.toThrow()
  }
})

test('la commande lit une cle privee par descripteur sans la journaliser', async () => {
  const c = await preparer()
  const cheminCle = join(c.racine, 'cle.bin')
  await writeFile(cheminCle, c.cle, { mode: 0o600 })
  const fd = openSync(cheminCle, 'r')
  try {
    const resultat = spawnSync(
      process.execPath,
      ['scripts/sauvegarde-locale.mjs', 'creer', c.source, c.archive],
      { stdio: ['ignore', 'pipe', 'pipe', fd], encoding: 'utf8' },
    )
    expect(resultat.status, resultat.stderr).toBe(0)
    expect(JSON.parse(resultat.stdout).fichiers).toBe(2)
    expect(resultat.stdout + resultat.stderr).not.toContain(c.cle.toString('hex'))
    expect(resultat.stdout + resultat.stderr).not.toContain(c.cle.toString('base64'))
  } finally {
    closeSync(fd)
  }
})
