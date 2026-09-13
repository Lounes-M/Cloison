import { beforeEach, expect, test, vi } from 'vitest'
import { commandeDocker } from '../scripts/commande-docker-documentaire.mjs'
import { profilConteneur } from '../scripts/profil-conteneur-documentaire.mjs'

vi.mock('../scripts/commande-docker-documentaire.mjs', () => ({ commandeDocker: vi.fn() }))
const image = 'sha256:' + 'a'.repeat(64)
const entree = Buffer.from(
  JSON.stringify({
    operation: 'verifier',
    type: 'application/pdf',
    filigrane: '',
    contenu: Buffer.from('%PDF-fictif').toString('base64'),
  }),
)
beforeEach(() => {
  vi.resetModules()
  vi.mocked(commandeDocker).mockReset()
})
async function moteur() {
  return (await import('../scripts/traiter-document-isole.mjs')).traiterDocumentIsole
}
function repondre() {
  vi.mocked(commandeDocker).mockImplementation(async (args) =>
    args[0] === 'start' ? Buffer.from('{"ok":true}') : Buffer.from(''),
  )
}

test('utilise le profil sans reseau ni volume et transmet le document exclusivement sur stdin', async () => {
  repondre()
  expect(await (await moteur())(entree, image)).toEqual(Buffer.alloc(0))
  const appels = vi.mocked(commandeDocker).mock.calls
  expect(appels.map((a) => a[0][0])).toEqual(['create', 'start', 'rm'])
  expect(appels[0]![0]).toEqual(profilConteneur(image, appels[0]![0][2]!))
  expect(appels[0]![0]).toContain('--network=none')
  expect(appels[0]![0]).toContain('--log-driver=none')
  expect(appels[0]![0].some((a) => a.includes('mount') || a.includes('volume'))).toBe(false)
  expect(appels[1]![1]).toBe(entree)
  expect(appels.flatMap((a) => a[0]).join(' ')).not.toContain(entree.toString())
})

for (const reponse of [
  'secret documentaire fictif',
  '{"ok":true,"inconnu":1}',
  '{"ok":false,"pages":null}',
]) {
  test(`refuse la reponse ${reponse} et supprime le conteneur`, async () => {
    repondre()
    vi.mocked(commandeDocker).mockImplementation(async (args) =>
      args[0] === 'start' ? Buffer.from(reponse) : Buffer.alloc(0),
    )
    await expect((await moteur())(entree, image)).rejects.toThrow()
    expect(vi.mocked(commandeDocker).mock.lastCall?.[0][0]).toBe('rm')
  })
}

for (const etape of ['create', 'start']) {
  test(`nettoie meme si ${etape} echoue ou depasse son delai`, async () => {
    vi.mocked(commandeDocker).mockImplementation(async (args) => {
      if (args[0] === etape) throw new Error('refus')
      return Buffer.alloc(0)
    })
    await expect((await moteur())(entree, image)).rejects.toThrow('refus')
    expect(vi.mocked(commandeDocker).mock.lastCall?.[0]).toEqual([
      'rm',
      '--force',
      expect.stringMatching(/^cloison-document-/),
    ])
  })
}

test('bloque les travaux suivants apres un nettoyage non confirme', async () => {
  repondre()
  const traiter = await moteur()
  vi.mocked(commandeDocker).mockImplementation(async (args) => {
    if (args[0] === 'rm') throw new Error('refus')
    return Buffer.from(args[0] === 'start' ? '{"ok":true}' : '')
  })
  await expect(traiter(entree, image)).rejects.toThrow('Nettoyage')
  vi.mocked(commandeDocker).mockClear()
  await expect(traiter(entree, image)).rejects.toThrow('indisponible')
  expect(commandeDocker).not.toHaveBeenCalled()
})

test('refuse la saturation et ne libere pas un slot avant nettoyage', async () => {
  const attentes: Array<() => void> = []
  vi.mocked(commandeDocker).mockImplementation(async (args) => {
    if (args[0] === 'rm') await new Promise<void>((r) => attentes.push(r))
    return Buffer.from(args[0] === 'start' ? '{"ok":true}' : '')
  })
  const traiter = await moteur()
  const a = traiter(entree, image),
    b = traiter(entree, image)
  await vi.waitFor(() => expect(attentes).toHaveLength(2))
  await expect(traiter(entree, image)).rejects.toThrow('indisponible')
  attentes.forEach((r) => r())
  await Promise.all([a, b])
  repondre()
  await expect(traiter(entree, image)).resolves.toEqual(Buffer.alloc(0))
})

for (const invalide of [
  'null',
  '{}',
  'pas du JSON',
  JSON.stringify({ ...JSON.parse(entree.toString()), contenu: 'QQ===' }),
  JSON.stringify({ ...JSON.parse(entree.toString()), secret: 'interdit' }),
]) {
  test(`refuse une demande invalide avant creation : ${invalide}`, async () => {
    await expect((await moteur())(Buffer.from(invalide), image)).rejects.toThrow('Demande')
    expect(commandeDocker).not.toHaveBeenCalled()
  })
}
for (const valeur of ['node:latest', '--privileged', 'sha256:' + 'g'.repeat(64)]) {
  test(`refuse une image non immuable ${valeur}`, async () => {
    await expect((await moteur())(entree, valeur)).rejects.toThrow('Image')
    expect(commandeDocker).not.toHaveBeenCalled()
  })
}
