import { beforeAll, afterAll, test, expect, vi } from 'vitest'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { baseDEssai } from './base'
import { fixtureCollecteDroits } from '../scripts/fixture-collecte-droits.mjs'
import { collecterPiecesDroits } from '../lib/droits/pieces'
import { decisionCollecte } from '../lib/droits/collecte'
import { sceller } from '../lib/coffre/enveloppe'
import { scellerAvecTrousseau } from '../lib/coffre/rotation-format'
import { stockagePiecesDroits } from '../lib/droits/stockage-pieces'
import { ecrirePiecesDroits } from '../scripts/collecter-pieces-droits.mjs'
import { mkdtemp, realpath, writeFile, readFile, stat, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let db: PGlite
beforeAll(async () => {
  db = await baseDEssai()
})
afterAll(async () => {
  await db.close()
})
async function fixture(active = false) {
  const f = await fixtureCollecteDroits(db)
  const trousseau = {
    historique: randomBytes(32),
    active: active ? randomBytes(32) : null,
    lecture: [],
  }
  const dek = randomBytes(32),
    contenu = Buffer.from('%PDF-1.7\n' + 'fictif'.repeat(20))
  await db.query('insert into cles_dossier(dossier_id,cle_scellee) values($1,$2)', [
    f.garant,
    scellerAvecTrousseau(dek, trousseau),
  ])
  const p = (
    await db.query<{ id: string }>(
      'update pieces set taille_octets=$1 where dossier_id=$2 returning id',
      [contenu.length, f.garant],
    )
  ).rows[0]!
  const d = { ...f.decision, revision: randomUUID(), pieces: [{ id: p.id, dossier: f.garant }] }
  const brut = JSON.stringify(d)
  await db.query(
    `insert into suivi_demandes_droits(operation,demande,precedente,operateur,nature,etat,recu_le,repondre_avant,effacer_le,preuve_sha256)
    select $1,demande,operation,operateur,nature,'en_cours',recu_le,repondre_avant,effacer_le,$2 from suivi_demandes_droits where operation=$3`,
    [d.revision, createHash('sha256').update(brut).digest('hex'), f.decision.revision],
  )
  const chiffre = sceller(contenu, dek)
  const telecharger = vi.fn(async () => Buffer.from(chiffre))
  return {
    ...f,
    d,
    brut,
    trousseau,
    contenu,
    chiffre,
    telecharger,
    executer: () => collecterPiecesDroits(db, brut, trousseau, telecharger),
  }
}
test.each([false, true])(
  'collecte originale avec rotation=%s, sans cle ni chemin dans le manifeste',
  async (active) => {
    const f = await fixture(active),
      r = await f.executer()
    expect(r.fichiers.get('piece-0001.pdf')).toEqual(f.contenu)
    expect(r.manifeste.remiseAutorisee).toBe(false)
    expect(JSON.stringify(r.manifeste)).not.toContain('chemin-prive')
    expect(JSON.stringify(r.manifeste)).not.toContain(f.trousseau.historique.toString('hex'))
    expect(r.manifeste.fichiers[0]?.sha256).toBe(
      createHash('sha256').update(f.contenu).digest('hex'),
    )
    await r.verifier()
  },
)
test('refuse les pieces sans approbation explicite et les doublons', async () => {
  const f = await fixture()
  expect(() =>
    decisionCollecte(JSON.stringify({ ...f.d, pieces: [...f.d.pieces, ...f.d.pieces] })),
  ).toThrow()
  expect(() =>
    decisionCollecte(
      JSON.stringify({ ...f.d, pieces: [{ id: randomUUID(), dossier: f.locataire }] }),
    ),
  ).toThrow()
  await expect(
    collecterPiecesDroits(db, JSON.stringify(f.decision), f.trousseau, f.telecharger),
  ).rejects.toThrow()
  expect(f.telecharger).not.toHaveBeenCalled()
})
test.each(['taille', 'marque', 'cle', 'type'])(
  'refuse la corruption %s et efface le tampon telecharge',
  async (cas) => {
    const f = await fixture()
    if (cas === 'cle') f.trousseau.historique.fill(0)
    if (cas === 'type')
      await db.query("update pieces set type_reel='image/png' where dossier_id=$1", [f.garant])
    const b = cas === 'taille' ? Buffer.from(f.chiffre.subarray(1)) : Buffer.from(f.chiffre)
    if (cas === 'marque') b[15] = b[15]! ^ 1
    f.telecharger.mockResolvedValue(b)
    await expect(f.executer()).rejects.toThrow('Collecte des pieces refusee.')
    expect(b.every((v) => v === 0)).toBe(true)
  },
)
test('refuse une piece disparue pendant Storage', async () => {
  const f = await fixture()
  f.telecharger.mockImplementation(async () => {
    await db.query('delete from pieces where dossier_id=$1', [f.garant])
    return Buffer.from(f.chiffre)
  })
  await expect(f.executer()).rejects.toThrow()
})
test.each(['anon', 'authenticated', 'porteur_lien', 'serveur', 'depot_piece', 'service_role'])(
  'aucun droit accorde a %s',
  async (role) => {
    const f = await fixture()
    await db.exec(`set role ${role}`)
    try {
      await expect(f.executer()).rejects.toThrow()
      expect(f.telecharger).not.toHaveBeenCalled()
    } finally {
      await db.exec('reset role')
    }
  },
)

const stockage = { projet: 'a'.repeat(20), jeton: 'a'.repeat(40) }
const chemin = `${randomUUID()}/${randomUUID()}`
test('Storage borne la lecture sans content-length et interdit les redirections', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array(29)))
  const b = await stockagePiecesDroits(stockage, fetcher)(chemin, 29, AbortSignal.timeout(5000))
  expect(b.length).toBe(29)
  expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error')
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    `https://${stockage.projet}.supabase.co/storage/v1/object/pieces/${chemin}`,
  )
})
test.each([28, 30])('Storage refuse %s octets pour 29 attendus', async (taille) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array(taille)))
  await expect(
    stockagePiecesDroits(stockage, fetcher)(chemin, 29, AbortSignal.timeout(5000)),
  ).rejects.toThrow()
})
test.each([302, 403, 404, 500])('Storage refuse HTTP %s', async (status) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('refus', { status }))
  await expect(
    stockagePiecesDroits(stockage, fetcher)(chemin, 29, AbortSignal.timeout(5000)),
  ).rejects.toThrow()
})
test('Storage refuse les chemins malveillants avant reseau', async () => {
  const fetcher = vi.fn<typeof fetch>()
  for (const p of [
    '../secret',
    `${randomUUID()}/..`,
    'https://example.com/a',
    `${randomUUID()}/a?x=1`,
  ])
    await expect(
      stockagePiecesDroits(stockage, fetcher)(p, 29, AbortSignal.timeout(5000)),
    ).rejects.toThrow()
  expect(fetcher).not.toHaveBeenCalled()
})
test.skipIf(!['linux', 'darwin'].includes(process.platform))(
  'sortie privee exclusive, nettoyage lors du refus final',
  async () => {
    const repertoire = await mkdtemp(join(await realpath(tmpdir()), 'cloison-pieces-'))
    try {
      const f = await fixture(),
        decision = join(repertoire, 'decision.json'),
        sortie = join(repertoire, 'copies')
      await writeFile(decision, f.brut, { mode: 0o600 })
      await ecrirePiecesDroits(decision, sortie, () => f.executer())
      expect((await stat(sortie)).mode & 0o777).toBe(0o700)
      expect((await stat(join(sortie, 'piece-0001.pdf'))).mode & 0o777).toBe(0o600)
      expect(await readFile(join(sortie, 'piece-0001.pdf'))).toEqual(f.contenu)
      await expect(ecrirePiecesDroits(decision, sortie, () => f.executer())).rejects.toThrow()
      expect(await readFile(join(sortie, 'piece-0001.pdf'))).toEqual(f.contenu)
      const autre = join(repertoire, 'refuse')
      await expect(
        ecrirePiecesDroits(decision, autre, async () => {
          const r = await f.executer()
          let appels = 0
          return {
            ...r,
            verifier: async () => {
              if (++appels === 3) throw new Error()
            },
          }
        }),
      ).rejects.toThrow()
      await expect(access(autre)).rejects.toThrow()
    } finally {
      await rm(repertoire, { recursive: true, force: true })
    }
  },
)
