import { beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({ contexte: vi.fn(), verify: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/agences/application-secours', () => ({ contexteApplicationSecours: h.contexte }))
import { testerApplication } from '@/lib/agences/action-tester-application'
const id = '11111111-1111-4111-8111-111111111111'
const autre = '22222222-2222-4222-8222-222222222222'
function contexte() {
  return { verifies: [{ id }], db: { auth: { mfa: { challengeAndVerify: h.verify } } } }
}
function agir(facteur = id, code = '123456') {
  const form = new FormData()
  form.set('facteur', facteur)
  form.set('code', code)
  return testerApplication({ succes: true }, form)
}
beforeEach(() => {
  vi.resetAllMocks()
  h.contexte.mockResolvedValue(contexte())
  h.verify.mockResolvedValue({ error: null })
})
test('confirme le code du facteur appartenant au compte puis relit les droits', async () => {
  expect(await agir()).toEqual({ succes: true })
  expect(h.verify).toHaveBeenCalledWith({ factorId: id, code: '123456' })
  expect(h.contexte).toHaveBeenCalledTimes(2)
})
test.each(['anonyme', 'etranger', 'identifiant', 'code'])(
  'refuse avant verification : %s',
  async (cas) => {
    if (cas === 'anonyme') h.contexte.mockResolvedValue(null)
    expect(
      await agir(
        cas === 'etranger' ? autre : cas === 'identifiant' ? 'invalid' : id,
        cas === 'code' ? '12345' : '123456',
      ),
    ).toHaveProperty('erreur')
    expect(h.verify).not.toHaveBeenCalled()
  },
)
test.each(['erreur', 'exception', 'revoque', 'session', 'relecture'])(
  'pas de faux succes ni detail prive : %s',
  async (cas) => {
    if (cas === 'erreur') h.verify.mockResolvedValue({ error: { message: 'DETAIL_PRIVE' } })
    if (cas === 'exception') h.verify.mockRejectedValue(new Error('DETAIL_PRIVE'))
    if (cas === 'revoque')
      h.contexte
        .mockResolvedValueOnce(contexte())
        .mockResolvedValue({ ...contexte(), verifies: [] })
    if (cas === 'session') h.contexte.mockResolvedValueOnce(contexte()).mockResolvedValue(null)
    if (cas === 'relecture')
      h.contexte.mockResolvedValueOnce(contexte()).mockRejectedValue(new Error('DETAIL_PRIVE'))
    const resultat = await agir()
    expect(resultat).toHaveProperty('erreur')
    expect(resultat.succes).toBeUndefined()
    expect(JSON.stringify(resultat)).not.toContain('DETAIL_PRIVE')
  },
)
