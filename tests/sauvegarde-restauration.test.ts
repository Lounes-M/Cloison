import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { gzipSync, gunzipSync } from 'node:zlib'
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
let dumpFictif: Promise<Buffer> | undefined
async function dumpDeBaseFictive() {
  dumpFictif ??= (async () => {
    const db = new PGlite()
    try {
      await db.exec('create table preuve_locale(id integer primary key)')
      return Buffer.from(await (await db.dumpDataDir()).arrayBuffer())
    } finally {
      await db.close()
    }
  })()
  return dumpFictif
}
const hash = (octets: Buffer) => createHash('sha256').update(octets).digest('hex')
async function configurer(source: string, objets: string[] = []) {
  const base = await readFile(join(source, 'base.dump'))
  const configuration = {
    version: 1,
    formatBase: 'pglite-tar',
    creeLe: '2026-09-06T10:00:00.000Z',
    base: { taille: base.length, sha256: hash(base) },
    objets: await Promise.all(
      objets.map(async (chemin) => {
        const contenu = await readFile(join(source, chemin))
        return { chemin, taille: contenu.length, sha256: hash(contenu) }
      }),
    ),
  }
  await writeFile(join(source, 'configuration.json'), JSON.stringify(configuration))
  return configuration
}
async function preparer() {
  const racine = await mkdtemp(join(await realpath(tmpdir()), 'cloison-restauration-'))
  repertoires.push(racine)
  const source = join(racine, 'source')
  await mkdir(join(source, 'objets'), { recursive: true })
  await writeFile(join(source, 'base.dump'), await dumpDeBaseFictive())
  await configurer(source)
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
  await configurer(contexte.source, ['objets/piece.chiffree'])
  const resultat = await sauvegarder(contexte.source, contexte.archive, contexte.cle)
  expect(resultat.fichiers).toBe(3)
  await rm(contexte.source, { recursive: true })
  expect((await restaurer(contexte.archive, contexte.cible, contexte.cle)).verification).toBe(
    'contrat-valide',
  )
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

for (const cas of [
  'json-vide',
  'objet-invalide',
  'champ-inconnu',
  'date-invalide',
  'taille-base',
  'hash-base',
  'format-base',
  'roles-pglite',
  'objet-manquant',
  'objet-supplementaire',
  'objet-duplique',
  'hash-objet',
]) {
  test(`la creation refuse le contrat ${cas} avant de creer une archive`, async () => {
    const c = await preparer()
    const objet = Buffer.from('objet fictif chiffre ailleurs')
    await writeFile(join(c.source, 'objets/fixture'), objet)
    const config = await configurer(c.source, ['objets/fixture'])
    const invalide: Record<string, unknown> = structuredClone(config)
    if (cas === 'champ-inconnu') invalide.secret = 'fictif'
    if (cas === 'date-invalide') invalide.creeLe = '2026-02-30T10:00:00Z'
    if (cas === 'taille-base') invalide.base = { ...config.base, taille: 0 }
    if (cas === 'hash-base') invalide.base = { ...config.base, sha256: '0'.repeat(64) }
    if (cas === 'format-base') invalide.formatBase = 'postgres-custom'
    if (cas === 'roles-pglite') invalide.rolesSql = 'create role fictif;'
    if (cas === 'objet-manquant') await rm(join(c.source, 'objets/fixture'))
    if (cas === 'objet-supplementaire') invalide.objets = []
    if (cas === 'objet-duplique') invalide.objets = [...config.objets, ...config.objets]
    if (cas === 'hash-objet') invalide.objets = [{ ...config.objets[0], sha256: '0'.repeat(64) }]
    await writeFile(
      join(c.source, 'configuration.json'),
      cas === 'json-vide' ? '' : cas === 'objet-invalide' ? 'null' : JSON.stringify(invalide),
    )
    await expect(sauvegarder(c.source, c.archive, c.cle)).rejects.toThrow()
    await expect(stat(c.archive)).rejects.toThrow()
  })
}

test('un fichier arbitraire ne devient pas une base parce que son empreinte est correcte', async () => {
  const c = await preparer()
  await writeFile(join(c.source, 'base.dump'), 'base fictive sans structure PostgreSQL')
  await configurer(c.source)
  await expect(sauvegarder(c.source, c.archive, c.cle)).rejects.toThrow()
  await expect(stat(c.archive)).rejects.toThrow()
})

test('une ancienne archive v1 reste extractible avec une assurance explicitement limitee', async () => {
  const c = await preparer()
  const fichiers = ['base.dump', 'configuration.json'].map((chemin) => {
    const octets = Buffer.from(chemin === 'base.dump' ? 'export historique inconnu' : '{}')
    return {
      chemin,
      taille: octets.length,
      sha256: hash(octets),
      contenu: octets.toString('base64'),
    }
  })
  await writeFile(c.archive, sceller(Buffer.from(JSON.stringify({ version: 1, fichiers })), c.cle))
  expect((await restaurer(c.archive, c.cible, c.cle)).verification).toBe('integrite-seule')
})

test('une archive v2 authentifiee au contrat incoherent ne cree aucune destination', async () => {
  const c = await preparer()
  await sauvegarder(c.source, c.archive, c.cle)
  const manifeste = JSON.parse(ouvrir(await readFile(c.archive), c.cle).toString())
  expect(manifeste.version).toBe(2)
  const configuration = manifeste.fichiers.find(
    (f: { chemin: string }) => f.chemin === 'configuration.json',
  )
  const contrat = JSON.parse(Buffer.from(configuration.contenu, 'base64').toString())
  contrat.base.sha256 = '0'.repeat(64)
  const nouveau = Buffer.from(JSON.stringify(contrat))
  Object.assign(configuration, {
    contenu: nouveau.toString('base64'),
    taille: nouveau.length,
    sha256: hash(nouveau),
  })
  await writeFile(c.archive, sceller(Buffer.from(JSON.stringify(manifeste)), c.cle))
  await expect(restaurer(c.archive, c.cible, c.cle)).rejects.toThrow('Contrat')
  await expect(stat(c.cible)).rejects.toThrow()
})

test('le tar PGlite brut reel est accepte sans pretendre remplacer son import', async () => {
  const c = await preparer()
  await writeFile(
    join(c.source, 'base.dump'),
    gunzipSync(await readFile(join(c.source, 'base.dump'))),
  )
  await configurer(c.source)
  expect((await sauvegarder(c.source, c.archive, c.cle)).verification).toBe('contrat-valide')
})

for (const cas of [
  'tar-tronque',
  'tar-checksum',
  'tar-version-absente',
  'gzip-tronque',
  'faux-pgdmp',
  'dump-vide',
]) {
  test(`la structure ${cas} est refusee meme avec une empreinte recalculee`, async () => {
    const c = await preparer()
    let dump = await readFile(join(c.source, 'base.dump'))
    const tar = gunzipSync(dump)
    if (cas === 'tar-tronque') dump = gzipSync(tar.subarray(0, tar.length - 1024))
    if (cas === 'tar-checksum') {
      tar[0] = tar[0]! ^ 1
      dump = gzipSync(tar)
    }
    if (cas === 'tar-version-absente') {
      let debut = -1
      for (let position = 0; position + 512 < tar.length; position += 512) {
        if (
          tar
            .subarray(position, position + 100)
            .toString()
            .split('\0')[0] === '/PG_VERSION'
        ) {
          debut = position
          break
        }
      }
      expect(debut).toBeGreaterThan(0)
      tar[debut + 512] = 'x'.charCodeAt(0)
      dump = gzipSync(tar)
    }
    if (cas === 'gzip-tronque') dump = dump.subarray(0, dump.length - 8)
    if (cas === 'faux-pgdmp') dump = Buffer.from('PGDMP ceci nest pas un vrai dump')
    if (cas === 'dump-vide') dump = Buffer.alloc(0)
    await writeFile(join(c.source, 'base.dump'), dump)
    const configuration = await configurer(c.source)
    if (cas === 'faux-pgdmp')
      await writeFile(
        join(c.source, 'configuration.json'),
        JSON.stringify({ ...configuration, formatBase: 'postgres-custom' }),
      )
    await expect(sauvegarder(c.source, c.archive, c.cle)).rejects.toThrow()
    await expect(stat(c.archive)).rejects.toThrow()
  })
}
