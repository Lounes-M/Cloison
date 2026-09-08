import { randomBytes } from 'node:crypto'
import { afterEach, expect, test, vi } from 'vitest'
import { deposer, type DepotBase } from '@/lib/coffre/depot'
import { ouvrir } from '@/lib/coffre/enveloppe'
import { ouvrirMaitresse, rescellerMaitresse } from '@/lib/coffre/rotation-maitresse'
const h = vi.hoisted(() => ({ rpc: vi.fn(), envoi: vi.fn() }))
vi.mock('@/lib/acces/serveur', () => ({ clientServeur: async () => ({ rpc: h.rpc }) }))
vi.mock('@/lib/env', () => ({
  env: { emailExpediteur: 'source@example.invalid', resendApiKey: 'fixture' },
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: h.envoi }
  },
}))
import { envoyer } from '@/lib/courriels/envoi'
import { distribuerCourriels } from '@/lib/courriels/file'
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})
function activer() {
  vi.stubEnv('CLE_MAITRESSE', randomBytes(32).toString('base64'))
  vi.stubEnv('CLE_MAITRESSE_ACTIVE', randomBytes(32).toString('base64'))
  vi.stubEnv('CLES_MAITRESSES_LECTURE', '')
}
test('le depot utilise une enveloppe versionnee et le rescellement preserve les octets', async () => {
  activer()
  const sauvegarde: { cle: Buffer; objet: Buffer } = {
    cle: Buffer.alloc(0),
    objet: Buffer.alloc(0),
  }
  const base: DepotBase = {
    cleScellee: async () => null,
    poserCleScellee: async (_id, valeur) => {
      sauvegarde.cle = valeur
      return 'posee'
    },
    televerser: async (_chemin, valeur) => {
      sauvegarde.objet = valeur
      return true
    },
    retirerObjet: async () => {},
    inscrirePiece: async () => 'piece',
    pieceDeposee: async () => null,
    supprimerPiece: async () => false,
    journaliser: async () => true,
  }
  const original = Buffer.from('%PDF-1.7\nDocument fictif')
  expect(
    (await deposer(base, '11111111-1111-4111-8111-111111111111', 'bulletin_paie', original)).depose,
  ).toBe(true)
  expect(sauvegarde.cle.length).toBeGreaterThan(60)
  const objetInitial = Buffer.from(sauvegarde.objet)
  vi.stubEnv('CLES_MAITRESSES_LECTURE', JSON.stringify([process.env.CLE_MAITRESSE_ACTIVE]))
  vi.stubEnv('CLE_MAITRESSE_ACTIVE', randomBytes(32).toString('base64'))
  const nouvelleEnveloppe = rescellerMaitresse(sauvegarde.cle)
  expect(ouvrir(sauvegarde.objet, ouvrirMaitresse(nouvelleEnveloppe))).toEqual(original)
  expect(sauvegarde.objet).toEqual(objetInitial)
})
test('un courriel mis en file avant rotation reste distribuable apres rotation', async () => {
  activer()
  let contenu = ''
  h.rpc.mockImplementation(async (nom: string, args: { chiffre?: string }) => {
    if (nom === 'mettre_courriel_en_file') contenu = args.chiffre!
    if (nom === 'prendre_courriels')
      return { data: [{ id: 'fictif', bail: 'bail', contenu }], error: null }
    return { data: nom === 'etat_file_courriels' ? 0 : true, error: null }
  })
  h.envoi.mockResolvedValue({ data: { id: 'resend_fictif' }, error: null })
  expect(
    await envoyer(
      'dest@example.invalid',
      'Sujet fictif',
      'Texte fictif',
      'fictif',
      undefined,
      true,
    ),
  ).toBe(true)
  vi.stubEnv('CLES_MAITRESSES_LECTURE', JSON.stringify([process.env.CLE_MAITRESSE_ACTIVE]))
  vi.stubEnv('CLE_MAITRESSE_ACTIVE', randomBytes(32).toString('base64'))
  expect(await distribuerCourriels({ rpc: h.rpc } as never)).toEqual({ traites: 1, echecs: 0 })
  expect(h.envoi).toHaveBeenCalledWith(
    expect.objectContaining({ text: 'Texte fictif' }),
    expect.anything(),
  )
})
