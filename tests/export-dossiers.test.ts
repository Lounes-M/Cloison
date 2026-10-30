import { beforeEach, expect, test, vi } from 'vitest'
import { exporterRegistre } from '@/lib/agences/exports-registres'
import { GET } from '@/app/(agence)/espace/exports/[registre]/route'
const contexte = vi.hoisted(() => vi.fn())
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: contexte }))

const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`
const ligne = (n: number) => ({
  id: id(n),
  reference: `CL-${n}`,
  statut: 'complet',
  garant: true,
  ratio: '3.456',
  cree_le: '2026-10-01T10:00:00+02:00',
  activite_le: '2026-10-20T09:30:00Z',
  expire_le: '2026-12-30T08:00:00Z',
})
const signal = () => new AbortController().signal
const generation = new Date('2026-10-26T12:00:00Z')

test('une ligne par dossier, statut lisible, ratio a deux decimales, sans adresse', async () => {
  const csv = await exporterRegistre(
    'dossiers',
    async () => [ligne(1), { ...ligne(2), statut: 'ouvert', garant: false, ratio: null }],
    signal(),
    generation,
  )
  const lignes = csv.split('\r\n')
  expect(lignes[0]).toBe(
    '﻿"Référence";"Statut";"Garant désigné";"Ratio";"Ouvert le (UTC)";"Dernière activité (UTC)";"Fin du coffre (UTC)";"Exporté le (UTC)"',
  )
  expect(lignes[1]).toBe(
    '"CL-1";"Complet";"Oui";"3,46";"2026-10-01T08:00:00.000Z";"2026-10-20T09:30:00.000Z";"2026-12-30T08:00:00.000Z";"2026-10-26T12:00:00.000Z"',
  )
  expect(lignes[2]).toContain('"CL-2";"Ouvert";"Non";"";')
  expect(csv).not.toContain('@')
})

test.each([
  [{ ...ligne(1), statut: 'inconnu' }],
  [{ ...ligne(1), ratio: '=1+1' }],
  [{ ...ligne(1), reference: '' }],
  [{ ...ligne(1), garant: 'oui' }],
  [{ ...ligne(1), activite_le: null }],
])('refuse une page de dossiers invalide', async (...page) => {
  await expect(exporterRegistre('dossiers', async () => page, signal())).rejects.toThrow()
})

const requete = {
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  gt: vi.fn(),
  abortSignal: vi.fn(),
}
const from = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  for (const m of ['select', 'eq', 'order', 'limit', 'gt'] as const)
    requete[m].mockReturnValue(requete)
  from.mockReturnValue(requete)
  contexte.mockResolvedValue({
    etat: 'rattache',
    agence: { id: id(90), statut: 'verifiee' },
    utilisateurId: id(91),
    supabase: { from, rpc: vi.fn() },
  })
})
const appeler = () =>
  GET(new Request('https://cloison.test/espace/exports/dossiers'), {
    params: Promise.resolve({ registre: 'dossiers' }),
  })
const brut = (n: number) => ({
  id: id(n),
  reference: `CL-${n}`,
  statut: 'depot_en_cours',
  email_garant: 'garant@example.invalid',
  cree_le: '2026-10-01T10:00:00Z',
  activite_rappel_le: '2026-10-15T07:00:00Z',
  expire_le: '2026-12-30T08:00:00Z',
  engagements: [{ ratio: 2.5 }],
})

test('route : demonstrations exclues, curseur par identifiant, adresse du garant jamais exportee', async () => {
  requete.abortSignal
    .mockResolvedValueOnce({ data: Array.from({ length: 20 }, (_, i) => brut(i + 1)), error: null })
    .mockResolvedValueOnce({
      data: [{ ...brut(21), email_garant: null, engagements: [] }],
      error: null,
    })
  const r = await appeler()
  expect(r.status).toBe(200)
  expect(r.headers.get('content-disposition')).toBe('attachment; filename="cloison-dossiers.csv"')
  expect(from).toHaveBeenCalledWith('dossiers')
  expect(requete.eq).toHaveBeenCalledWith('demonstration', false)
  expect(requete.order).toHaveBeenCalledWith('id', { ascending: true })
  expect(requete.gt).toHaveBeenCalledTimes(1)
  expect(requete.gt).toHaveBeenCalledWith('id', id(20))
  const csv = await r.text()
  expect(csv).not.toContain('garant@example.invalid')
  expect(csv).toContain(
    '"CL-1";"Dépôt en cours";"Oui";"2,50";"2026-10-01T10:00:00.000Z";"2026-10-15T07:00:00.000Z";',
  )
  expect(csv).toContain('"CL-21";"Dépôt en cours";"Non";""')
})

test('route : agence non verifiee ou lecture en erreur, aucun fichier', async () => {
  contexte.mockResolvedValue({ etat: 'rattache', agence: { id: id(90), statut: 'decouverte' } })
  expect((await appeler()).status).toBe(403)
  expect(from).not.toHaveBeenCalled()
  contexte.mockResolvedValue({
    etat: 'rattache',
    agence: { id: id(90), statut: 'verifiee' },
    utilisateurId: id(91),
    supabase: { from },
  })
  requete.abortSignal.mockResolvedValue({ data: null, error: { message: 'x' } })
  expect((await appeler()).status).toBe(503)
})
