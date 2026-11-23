import { beforeEach, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
const d = vi.hoisted(() => ({ envoyer: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/courriels/envoi', () => ({
  adresseDuSite: () => 'https://example.invalid',
  envoyer: d.envoyer,
}))
import { annoncerFinsDeDossier } from '@/lib/courriels/fin-dossier'

const annonce = {
  dossier_id: '22222222-2222-4222-8222-222222222222',
  reference: 'ABCD1234',
  email_locataire: 'loc@example.invalid',
  email_garant: 'garant@example.invalid',
  expiration: '2026-12-01T10:00:00+00:00',
  secondaire: false,
}
const db = { rpc: d.rpc } as unknown as SupabaseClient
let annonces: unknown
beforeEach(() => {
  vi.clearAllMocks()
  annonces = [annonce]
  d.envoyer.mockResolvedValue(true)
  d.rpc.mockImplementation(async (n: string) => ({
    data:
      n === 'echeances_a_annoncer'
        ? annonces
        : n === 'langues_courriels'
          ? [{ adresse: 'garant@example.invalid', langue: 'en' }]
          : true,
    error: null,
  }))
})

test('le locataire et le garant sont prévenus chacun dans sa langue, puis l’annonce est acquittée', async () => {
  expect(await annoncerFinsDeDossier(db)).toEqual({ echecs: 0 })
  expect(d.envoyer).toHaveBeenCalledTimes(2)
  const [locataire, garant] = d.envoyer.mock.calls
  expect(locataire![0]).toBe('loc@example.invalid')
  expect(locataire![1]).toBe('Ton dossier Cloison arrive à échéance')
  expect(locataire![2].text).toContain('ABCD1234')
  expect(locataire![2].text).toContain('1 décembre 2026')
  expect(garant![0]).toBe('garant@example.invalid')
  expect(garant![1]).toBe('Your Cloison file is nearing its deadline')
  // Mise en file différée, sous une clé stable et distincte par destinataire.
  expect(locataire![5]).toBe(true)
  expect(locataire![3]).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)
  expect(locataire![3]).not.toBe(garant![3])
  // Aucun lien de capacité ni adresse de l'autre partie dans le corps.
  expect(JSON.stringify(locataire![2])).not.toContain('garant@example.invalid')
  expect(JSON.stringify(garant![2])).not.toContain('/lien/')
  expect(d.rpc).toHaveBeenCalledWith('acquitter_alerte_echeance', {
    le_dossier: annonce.dossier_id,
    l_expiration: annonce.expiration,
  })
})

test('la même annonce rejouée garde les mêmes clés', async () => {
  await annoncerFinsDeDossier(db)
  await annoncerFinsDeDossier(db)
  expect(d.envoyer.mock.calls[0]![3]).toBe(d.envoyer.mock.calls[2]![3])
})

test('le second garant est prévenu seul, le locataire l’est par le dossier principal', async () => {
  annonces = [{ ...annonce, secondaire: true }]
  await annoncerFinsDeDossier(db)
  expect(d.envoyer).toHaveBeenCalledExactlyOnceWith(
    'garant@example.invalid',
    expect.any(String),
    expect.anything(),
    expect.any(String),
    undefined,
    true,
    expect.anything(),
  )
})

test('une mise en file refusée laisse l’annonce à rejouer', async () => {
  d.envoyer.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
  expect(await annoncerFinsDeDossier(db)).toEqual({ echecs: 1 })
  expect(d.rpc).not.toHaveBeenCalledWith('acquitter_alerte_echeance', expect.anything())
})

test('une réponse illisible de la base arrête le lot', async () => {
  annonces = [{ ...annonce, reference: 1 }]
  await expect(annoncerFinsDeDossier(db)).rejects.toThrow('indisponibles')
  expect(d.envoyer).not.toHaveBeenCalled()
})
