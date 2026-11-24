import { beforeEach, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
const d = vi.hoisted(() => ({ envoyer: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/courriels/envoi', () => ({ envoyer: d.envoyer }))
vi.mock('@/lib/env', () => ({ env: { emailDestinataire: 'exploitant@example.invalid' } }))
import { alerterDelaisAgence } from '@/lib/courriels/delais-agence'

const demande = {
  nature: 'demande',
  objet: '22222222-2222-4222-8222-222222222222',
  depuis: '2026-11-23T09:00:00+00:00',
  palier: 'proche',
  nom: 'Agence Bellevue',
  contact: 'contact@bellevue.example.invalid',
  echeance: '2026-11-25T09:00:00+00:00',
}
const activation = {
  ...demande,
  nature: 'activation',
  objet: '33333333-3333-4333-8333-333333333333',
  palier: 'depasse',
  contact: 'bellevue.example.invalid',
}
const db = { rpc: d.rpc } as unknown as SupabaseClient
let alertes: unknown
beforeEach(() => {
  vi.clearAllMocks()
  alertes = [demande, activation]
  d.envoyer.mockResolvedValue(true)
  d.rpc.mockImplementation(async (n: string) => ({
    data: n === 'delais_agence_a_alerter' ? alertes : true,
    error: null,
  }))
})

test('chaque demande en retard prévient l’exploitant, puis l’alerte est acquittée', async () => {
  expect(await alerterDelaisAgence(db)).toEqual({ echecs: 0 })
  expect(d.envoyer).toHaveBeenCalledTimes(2)
  const [proche, depasse] = d.envoyer.mock.calls
  expect(proche![0]).toBe('exploitant@example.invalid')
  expect(proche![1]).toBe(
    '48 h, il reste un jour ouvré : Demande de démonstration, Agence Bellevue',
  )
  expect(proche![2]).toContain('contact@bellevue.example.invalid')
  expect(proche![2]).toContain('mercredi 25 novembre 2026 à 10:00')
  expect(proche![2]).toContain("set statut = 'contactee'")
  expect(proche![2]).toContain(demande.objet)
  expect(depasse![1]).toBe('48 h dépassées : Demande d’activation, Agence Bellevue')
  expect(depasse![2]).toContain("set statut = 'verifiee'")
  expect(depasse![2]).toContain('activation_demandee_le = null')
  // Courriel interne en texte seul, différé, sous une clé stable par palier.
  expect(typeof proche![2]).toBe('string')
  expect(proche![5]).toBe(true)
  expect(proche![3]).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)
  expect(proche![3]).not.toBe(depasse![3])
  expect(d.rpc).toHaveBeenCalledWith('acquitter_alerte_delai', {
    la_nature: 'demande',
    l_objet: demande.objet,
    le_depart: demande.depuis,
    le_palier: 'proche',
  })
})

test('la même alerte rejouée garde la même clé, et chaque palier a la sienne', async () => {
  alertes = [demande]
  await alerterDelaisAgence(db)
  await alerterDelaisAgence(db)
  alertes = [{ ...demande, palier: 'depasse' }]
  await alerterDelaisAgence(db)
  const cles = d.envoyer.mock.calls.map((appel) => appel[3])
  expect(cles[0]).toBe(cles[1])
  expect(cles[2]).not.toBe(cles[0])
})

test('une mise en file refusée laisse l’alerte à rejouer', async () => {
  d.envoyer.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  expect(await alerterDelaisAgence(db)).toEqual({ echecs: 1 })
  expect(d.rpc).not.toHaveBeenCalledWith(
    'acquitter_alerte_delai',
    expect.objectContaining({ la_nature: 'demande' }),
  )
  expect(d.rpc).toHaveBeenCalledWith(
    'acquitter_alerte_delai',
    expect.objectContaining({ la_nature: 'activation' }),
  )
})

test('une réponse illisible de la base arrête le lot', async () => {
  alertes = [{ ...demande, palier: 'tard' }]
  await expect(alerterDelaisAgence(db)).rejects.toThrow('indisponibles')
  expect(d.envoyer).not.toHaveBeenCalled()
})
