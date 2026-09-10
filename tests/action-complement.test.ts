import { beforeEach, expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({
  contexte: vi.fn(),
  porteur: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
  lecture: vi.fn(),
  revalider: vi.fn(),
}))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: h.contexte }))
vi.mock('@/lib/acces/session', () => ({
  capaciteDepuisCookies: h.porteur,
  clientPorteurDeLien: h.client,
}))
vi.mock('next/cache', () => ({ revalidatePath: h.revalider }))
import { modifierComplement } from '@/lib/agences/action-complement'
const dossier = '22222222-2222-4222-8222-222222222222',
  cible = '33333333-3333-4333-8333-333333333333'
function formulaire(operation = 'demander') {
  const f = new FormData()
  for (const [cle, valeur] of Object.entries({
    dossier,
    cible,
    operation,
    motif: 'illisible',
    piece: '44444444-4444-4444-8444-444444444444',
  }))
    f.set(cle, valeur)
  return f
}
beforeEach(() => {
  vi.clearAllMocks()
  const requete = { select: () => requete, eq: () => requete, maybeSingle: h.lecture }
  const db = { from: () => requete, rpc: h.rpc }
  h.contexte.mockResolvedValue({ etat: 'rattache', supabase: db })
  h.porteur.mockResolvedValue({
    capacite: { partie: 'garant', dossierId: dossier },
    jeton: 'fictif',
  })
  h.client.mockReturnValue(db)
  h.lecture.mockResolvedValue({ data: { id: cible }, error: null })
  h.rpc.mockResolvedValue({ data: true, error: null })
})
test.each([null, false, 'true', {}, undefined])(
  'un acquittement ambigu %j ne confirme aucune modification',
  async (data) => {
    h.rpc.mockResolvedValue({ data, error: null })
    expect(await modifierComplement({ statut: 'inactif' }, formulaire())).toEqual({
      statut: 'erreur',
    })
    expect(h.revalider).not.toHaveBeenCalled()
  },
)
test('une cible absente du dossier affiche ne declenche pas le RPC', async () => {
  h.lecture.mockResolvedValue({ data: null, error: null })
  expect(await modifierComplement({ statut: 'inactif' }, formulaire())).toEqual({
    statut: 'erreur',
  })
  expect(h.rpc).not.toHaveBeenCalled()
})
test('un ancien formulaire garant ne modifie pas son nouveau dossier actif', async () => {
  h.porteur.mockResolvedValue({ capacite: { partie: 'garant', dossierId: cible }, jeton: 'fictif' })
  expect(await modifierComplement({ statut: 'inactif' }, formulaire('fournir'))).toEqual({
    statut: 'erreur',
  })
  expect(h.client).not.toHaveBeenCalled()
})
test('le locataire ne propose pas de remplacement', async () => {
  h.porteur.mockResolvedValue({
    capacite: { partie: 'locataire', dossierId: dossier },
    jeton: 'fictif',
  })
  expect(await modifierComplement({ statut: 'inactif' }, formulaire('fournir'))).toEqual({
    statut: 'erreur',
  })
  expect(h.rpc).not.toHaveBeenCalled()
})
test.each(['demander', 'fournir', 'valider', 'refuser'])(
  'une operation %s confirmee actualise les espaces',
  async (op) => {
    expect(await modifierComplement({ statut: 'inactif' }, formulaire(op))).toEqual({
      statut: 'enregistre',
    })
    expect(h.rpc).toHaveBeenCalledOnce()
    expect(h.revalider).toHaveBeenCalledWith('/garant')
    expect(h.revalider).toHaveBeenCalledWith(`/espace/dossiers/${dossier}`)
  },
)
