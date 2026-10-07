import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
const io = vi.hoisted(() => ({
  lireBorne: vi.fn(),
  ecrireNeuf: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
}))
vi.mock('../scripts/fichiers-export-prives.mjs', () => ({
  systemeSupporte: () => true,
  verifierSysteme: () => {},
  repertoirePrive: async () => {},
  lireBorne: io.lireBorne,
  ecrireNeuf: io.ecrireNeuf,
}))
vi.mock('node:fs/promises', () => ({ mkdir: io.mkdir, rm: io.rm }))
import { exporterDroits } from '../scripts/exporter-droits.mjs'
import { creerPaquetDroits } from '../scripts/paquet-droits.mjs'

const cle = randomBytes(32)
const texte = 'Document fictif confidentiel'
function decision() {
  return {
    version: 1,
    demande: randomUUID(),
    revision: randomUUID(),
    decisionSha256: 'a'.repeat(64),
    destinataireSha256: 'b'.repeat(64),
    creeLe: new Date(Date.now() - 1000).toISOString(),
    expireLe: new Date(Date.now() + 60000).toISOString(),
    exclusions: [],
    fichiers: [
      {
        nom: 'donnees-0001.txt',
        taille: Buffer.byteLength(texte),
        sha256: createHash('sha256').update(texte).digest('hex'),
      },
    ],
  }
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
})
it.each(['succes', 'lecture', 'chiffrement', 'suivi', 'ecriture'])(
  'efface les fichiers lus pendant la creation : %s',
  async (cas) => {
    const d = decision()
    const contenu = Buffer.from(texte)
    if (cas === 'lecture') d.fichiers.push({ ...d.fichiers[0]!, nom: 'piece-0002.txt' })
    if (cas === 'chiffrement') d.fichiers[0]!.sha256 = '0'.repeat(64)
    io.lireBorne.mockImplementation(async (chemin: string) => {
      if (chemin === 'decision') return Buffer.from(JSON.stringify(d))
      if (chemin.endsWith('piece-0002.txt')) throw new Error('Lecture refusee')
      return contenu
    })
    const suivi = vi.fn().mockResolvedValue(undefined)
    if (cas === 'suivi')
      suivi.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Suivi refuse'))
    if (cas === 'ecriture') io.ecrireNeuf.mockRejectedValueOnce(new Error('Ecriture refusee'))
    const operation = exporterDroits('creer', 'decision', 'source', 'destination', cle, suivi)
    if (cas === 'succes') expect((await operation).fichiers).toBe(1)
    else await expect(operation).rejects.toThrow()
    expect(contenu).toEqual(Buffer.alloc(contenu.length))
    expect(cle.some((octet) => octet !== 0)).toBe(true)
  },
)
it.each(['succes', 'mkdir', 'ecriture', 'suivi'])('efface le clair extrait : %s', async (cas) => {
  const d = decision()
  const archive = creerPaquetDroits(d, new Map([['donnees-0001.txt', Buffer.from(texte)]]), cle)
  io.lireBorne.mockImplementation(async (chemin: string) =>
    chemin === 'decision' ? Buffer.from(JSON.stringify(d)) : archive,
  )
  const from = Buffer.from.bind(Buffer)
  const decodes: Buffer[] = []
  vi.spyOn(Buffer, 'from').mockImplementation(((...args: unknown[]) => {
    const resultat: Buffer = Reflect.apply(from, Buffer, args)
    if (args[1] === 'base64') decodes.push(resultat)
    return resultat
  }) as typeof Buffer.from)
  const suivi = vi.fn().mockResolvedValue(undefined)
  if (cas === 'mkdir') io.mkdir.mockRejectedValueOnce(new Error('Creation refusee'))
  if (cas === 'ecriture') io.ecrireNeuf.mockRejectedValueOnce(new Error('Ecriture refusee'))
  if (cas === 'suivi')
    suivi.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Suivi refuse'))
  const operation = exporterDroits('extraire', 'decision', 'source', 'destination', cle, suivi)
  if (cas === 'succes') expect((await operation).fichiers).toBe(1)
  else await expect(operation).rejects.toThrow()
  expect(decodes).toHaveLength(1)
  expect(decodes[0]).toEqual(Buffer.alloc(Buffer.byteLength(texte)))
})
