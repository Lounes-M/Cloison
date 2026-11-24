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
  depuis: '2026-11-19T09:00:00+00:00',
  palier: 'depasse',
  contact: 'bellevue.example.invalid',
  echeance: '2026-11-23T09:00:00+00:00',
}
// Mardi 24 novembre 2026, midi à Paris : un jour ouvré est passé pour la
// demande du lundi, deux pour l'activation du jeudi précédent.
const MARDI = new Date('2026-11-24T11:00:00Z')
const alerter = (maintenant = MARDI) => alerterDelaisAgence(db, undefined, maintenant)
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
  expect(await alerter()).toEqual({ echecs: 0, reportees: 0 })
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
  await alerter()
  await alerter()
  alertes = [{ ...demande, palier: 'depasse' }]
  await alerter(new Date('2026-11-25T11:00:00Z'))
  const cles = d.envoyer.mock.calls.map((appel) => appel[3])
  expect(cles[0]).toBe(cles[1])
  expect(cles[2]).not.toBe(cles[0])
})

test('une mise en file refusée laisse l’alerte à rejouer', async () => {
  d.envoyer.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  expect(await alerter()).toEqual({ echecs: 1, reportees: 0 })
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
  await expect(alerter()).rejects.toThrow('indisponibles')
  expect(d.envoyer).not.toHaveBeenCalled()
})

// Reçue le mardi 10 novembre 2026 à 10 h, heure de Paris. Le mercredi 11 est
// férié : la base, qui l'ignore, compte un jour dès le mercredi 10 h et deux
// dès le jeudi 10 h. Le vrai délai tombe le jeudi 10 h puis le vendredi 10 h.
const veilleDeFerie = {
  ...demande,
  depuis: '2026-11-10T09:00:00+00:00',
  echeance: '2026-11-12T09:00:00+00:00',
}
const acquittements = () => d.rpc.mock.calls.filter(([n]) => n === 'acquitter_alerte_delai')

test('un jour férié ne compte pas : la demande que la base croit due attend', async () => {
  alertes = [veilleDeFerie]
  // Mercredi 11 novembre, midi : pour la base un jour est passé, en réalité aucun.
  expect(await alerter(new Date('2026-11-11T11:00:00Z'))).toEqual({ echecs: 0, reportees: 1 })
  expect(d.envoyer).not.toHaveBeenCalled()
  // Sans acquittement, la base la représente au passage suivant.
  expect(acquittements()).toHaveLength(0)
})

test('le lendemain du férié, c’est « il reste un jour » qui part, même si la base dit dépassé', async () => {
  alertes = [{ ...veilleDeFerie, palier: 'depasse' }]
  // Jeudi 12 novembre, midi : pour la base deux jours sont passés, en réalité un.
  expect(await alerter(new Date('2026-11-12T11:00:00Z'))).toEqual({ echecs: 0, reportees: 0 })
  const [appel] = d.envoyer.mock.calls
  expect(appel![1]).toBe('48 h, il reste un jour ouvré : Demande de démonstration, Agence Bellevue')
  // L'échéance annoncée est la vraie, et le jour retiré est nommé.
  expect(appel![2]).toContain('vendredi 13 novembre 2026 à 10:00')
  expect(appel![2]).toContain('Férié    : mercredi 11 novembre (Armistice de 1918), non compté')
  expect(acquittements()[0]![1]).toMatchObject({ le_palier: 'proche' })
  // Rejouée tant que la base la croit dépassée : même clé, donc aucun doublon.
  await alerter(new Date('2026-11-12T11:15:00Z'))
  expect(d.envoyer.mock.calls[1]![3]).toBe(appel![3])
})

test('une fois les deux jours ouvrés réellement passés, le dépassement part', async () => {
  alertes = [{ ...veilleDeFerie, palier: 'depasse' }]
  // Vendredi 13 novembre, 9 h 59 puis 10 h, heure de Paris.
  await alerter(new Date('2026-11-13T08:59:00Z'))
  expect(d.envoyer.mock.calls[0]![1]).toContain('il reste un jour ouvré')
  await alerter(new Date('2026-11-13T09:00:00Z'))
  expect(d.envoyer.mock.calls[1]![1]).toBe(
    '48 h dépassées : Demande de démonstration, Agence Bellevue',
  )
  expect(acquittements()[1]![1]).toMatchObject({ le_palier: 'depasse' })
  expect(d.envoyer.mock.calls[1]![3]).not.toBe(d.envoyer.mock.calls[0]![3])
})

test('sans jour férié dans le délai, le courriel n’en mentionne aucun', async () => {
  alertes = [demande]
  await alerter()
  expect(d.envoyer.mock.calls[0]![2]).not.toContain('Férié')
})
