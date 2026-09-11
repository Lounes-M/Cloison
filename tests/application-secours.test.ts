import { beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({
  user: vi.fn(),
  niveau: vi.fn(),
  liste: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
  verify: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: h.refresh }))
vi.mock('@/lib/acces/agence', () => ({
  utilisateurCourant: h.user,
  clientAgence: async () => ({
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: h.niveau,
        listFactors: h.liste,
        enroll: h.enroll,
        unenroll: h.unenroll,
        challengeAndVerify: h.verify,
      },
    },
  }),
}))
import { gererApplicationSecours } from '@/lib/agences/action-application-secours'
const principal = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'verified',
  factor_type: 'totp',
  friendly_name: 'Principal',
}
const pending = {
  id: '22222222-2222-4222-8222-222222222222',
  status: 'unverified',
  factor_type: 'totp',
  friendly_name: 'Cloison secours',
}
function facteurs(all = [principal]) {
  h.liste.mockResolvedValue({
    data: { all, totp: all.filter((f) => f.status === 'verified') },
    error: null,
  })
}
async function agir(operation = 'preparer', facteur = pending.id, code = '123456') {
  const form = new FormData()
  form.set('operation', operation)
  form.set('facteur', facteur)
  form.set('code', code)
  return gererApplicationSecours({ qr: 'SECRET_CLIENT', secret: 'SECRET_CLIENT' }, form)
}
beforeEach(() => {
  vi.resetAllMocks()
  h.user.mockResolvedValue({ id: principal.id })
  h.niveau.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null })
  facteurs()
  h.enroll.mockResolvedValue({
    data: { id: pending.id, totp: { qr_code: '<svg/>', secret: 'FICTIF' } },
    error: null,
  })
  h.unenroll.mockResolvedValue({ error: null })
  h.verify.mockResolvedValue({ error: null })
})
test.each(['anonyme', 'aal1', 'niveau', 'liste', 'aucun', 'exception'])(
  'aucune mutation sans contexte fiable : %s',
  async (cas) => {
    if (cas === 'anonyme') h.user.mockResolvedValue(null)
    if (cas === 'aal1') h.niveau.mockResolvedValue({ data: { currentLevel: 'aal1' } })
    if (cas === 'niveau') h.niveau.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: {} })
    if (cas === 'liste')
      h.liste.mockResolvedValue({ data: { all: [principal], totp: [principal] }, error: {} })
    if (cas === 'aucun') facteurs([])
    if (cas === 'exception') h.user.mockRejectedValue(new Error('DETAIL_PRIVE'))
    for (const operation of ['preparer', 'verifier', 'annuler'])
      expect(await agir(operation)).toEqual({ erreur: expect.any(String) })
    expect(h.enroll).not.toHaveBeenCalled()
    expect(h.verify).not.toHaveBeenCalled()
    expect(h.unenroll).not.toHaveBeenCalled()
  },
)
test('la preparation retourne seulement la nouvelle cle', async () => {
  expect(await agir()).toEqual({ facteur: pending.id, qr: '<svg/>', secret: 'FICTIF' })
  expect(h.enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'Cloison secours' })
})
test.each(['deux', 'attente'])('pas de preparation supplementaire : %s', async (cas) => {
  facteurs([principal, { ...pending, status: cas === 'deux' ? 'verified' : 'unverified' }])
  expect(await agir()).toHaveProperty('erreur')
  expect(h.enroll).not.toHaveBeenCalled()
})
test.each(['etranger', 'verifie', 'autre-nom', 'autre-type', 'uuid'])(
  'aucune suppression ni confirmation d’un facteur non admissible : %s',
  async (cas) => {
    facteurs([
      principal,
      {
        ...pending,
        ...(cas === 'verifie'
          ? { status: 'verified' }
          : cas === 'autre-nom'
            ? { friendly_name: 'Autre' }
            : cas === 'autre-type'
              ? { factor_type: 'phone' }
              : {}),
      },
    ])
    const id = cas === 'etranger' ? principal.id : cas === 'uuid' ? '-'.repeat(36) : pending.id
    for (const operation of ['annuler', 'verifier'])
      expect(await agir(operation, id)).toHaveProperty('erreur')
    expect(h.unenroll).not.toHaveBeenCalled()
    expect(h.verify).not.toHaveBeenCalled()
  },
)
test('une preparation retrouvee apres rechargement peut etre annulee', async () => {
  facteurs([principal, pending])
  expect(await agir('annuler')).toEqual({})
  expect(h.unenroll).toHaveBeenCalledWith({ factorId: pending.id })
  expect(h.refresh).toHaveBeenCalled()
})
test('la confirmation efface le secret et actualise la page', async () => {
  facteurs([principal, pending])
  expect(await agir('verifier')).toEqual({ succes: true })
  expect(h.verify).toHaveBeenCalledWith({ factorId: pending.id, code: '123456' })
  expect(h.refresh).toHaveBeenCalled()
})
test.each(['12345', '1234567', 'abcdef', ' 123456'])(
  'code invalide refuse avant le fournisseur : %s',
  async (code) => {
    facteurs([principal, pending])
    expect(await agir('verifier', pending.id, code)).toEqual({
      facteur: pending.id,
      erreur: expect.any(String),
    })
    expect(h.verify).not.toHaveBeenCalled()
  },
)
test.each(['preparer', 'annuler', 'verifier'])(
  'panne fournisseur sans secret ni faux succes : %s',
  async (operation) => {
    if (operation !== 'preparer') facteurs([principal, pending])
    const mock =
      operation === 'preparer' ? h.enroll : operation === 'annuler' ? h.unenroll : h.verify
    mock.mockResolvedValue({ error: { message: 'DETAIL_PRIVE' } })
    const result = await agir(operation)
    expect(result.erreur).toBeTruthy()
    expect(result.succes).toBeUndefined()
    expect(JSON.stringify(result)).not.toMatch(/DETAIL_PRIVE|SECRET_CLIENT|FICTIF/)
    expect(h.refresh).not.toHaveBeenCalled()
  },
)
test('une operation inconnue ne modifie aucun facteur', async () => {
  facteurs([principal, pending])
  expect(await agir('supprimer')).toHaveProperty('erreur')
  expect(h.unenroll).not.toHaveBeenCalled()
  expect(h.verify).not.toHaveBeenCalled()
  expect(h.enroll).not.toHaveBeenCalled()
})
