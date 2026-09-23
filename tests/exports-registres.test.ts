import { beforeEach, expect, test, vi } from 'vitest'
import { celluleCSV, exporterRegistre, RegistreTropGrand } from '@/lib/agences/exports-registres'
import { GET } from '@/app/(agence)/espace/exports/[registre]/route'
const contexte = vi.hoisted(() => vi.fn())
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: contexte }))
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`
const archive = (n: number) => ({
  id: id(n),
  modele: 'Modèle "essai"; test',
  archive_le: '2026-09-23T14:00:00+02:00',
  conserver_jusqu_au: '2031-09-23T12:00:00Z',
  environnement: 'sandbox',
  secret: 'INTERDIT',
})
const reglement = {
  id: id(1),
  montant_cents: 2901,
  rembourse_cents: 100,
  cree_le: '2026-09-23T12:00:00Z',
  paye_le: null,
  tarif_version: 'v1',
  etat: 'litige',
  anomalie: true,
}
const signal = () => new AbortController().signal
const generation = new Date('2026-09-23T13:00:00Z')
const rpc = vi.fn(),
  lecture = vi.fn()
const c = () => ({
  etat: 'rattache',
  agence: { id: id(90), statut: 'verifiee' },
  utilisateurId: id(91),
  supabase: { rpc },
})
const appeler = (registre = 'archives', s = signal()) =>
  GET(new Request(`https://cloison.test/espace/exports/${registre}`, { signal: s }), {
    params: Promise.resolve({ registre }),
  })
beforeEach(() => {
  vi.resetAllMocks()
  contexte.mockResolvedValue(c())
  rpc.mockReturnValue({ abortSignal: lecture })
  lecture.mockResolvedValue({ data: [archive(1)], error: null })
})
test.each([
  '=1+1',
  '+CMD()',
  '-1+1',
  '@SUM(1)',
  '\t=1',
  '\r\n+1',
  '＝1',
  '＋1',
  '－1',
  '＠SUM(1)',
  '\u0000=1',
  '  =1',
])('neutralise une formule %j', (valeur) => {
  expect(celluleCSV(valeur)).toMatch(/^"Texte : /)
})
test('échappe les séparateurs, guillemets et contrôles sans créer de cellules', () => {
  expect(celluleCSV('un;"deux"\r\n=1')).toBe('"un;""deux""  =1"')
})
test('collecte toutes les pages avec le dernier identifiant et une génération commune', async () => {
  const lire = vi
    .fn()
    .mockResolvedValueOnce(Array.from({ length: 20 }, (_, i) => archive(i + 1)))
    .mockResolvedValueOnce([archive(21)])
  const csv = await exporterRegistre('archives', lire, signal(), generation)
  expect(lire.mock.calls).toEqual([[null], [id(20)]])
  expect(csv.startsWith('\ufeff"Référence acte";')).toBe(true)
  expect(csv.split('\r\n')).toHaveLength(23)
  expect(csv).toContain(id(21))
  expect(csv).toContain('"2026-09-23T12:00:00.000Z"')
  expect(csv.match(/2026-09-23T13:00:00.000Z/g)).toHaveLength(21)
  expect(csv).not.toContain('INTERDIT')
})
test('montants exacts, remboursement et anomalie indépendants de l’état', async () => {
  const csv = await exporterRegistre('reglements', async () => [reglement], signal(), generation)
  expect(csv).toContain('"29,01";"1,00"')
  expect(csv).toContain('"Litige à examiner";"Oui"')
})
test('registre vide : en-têtes présents', async () => {
  const csv = await exporterRegistre('archives', async () => [], signal())
  expect(csv.split('\r\n')).toHaveLength(2)
})
test.each([
  null,
  [{}],
  [{ ...archive(1), archive_le: 'hier' }],
  [{ ...archive(1), modele: 'x'.repeat(501) }],
  Array.from({ length: 21 }, (_, i) => archive(i)),
])('refuse les pages invalides sans fichier partiel', async (page) => {
  await expect(exporterRegistre('archives', async () => page, signal())).rejects.toThrow()
})
test('refuse les remboursements supérieurs au montant', async () => {
  await expect(
    exporterRegistre('reglements', async () => [{ ...reglement, rembourse_cents: 3000 }], signal()),
  ).rejects.toThrow()
})
test('un curseur répété ne boucle pas', async () => {
  const lire = vi.fn().mockResolvedValue(Array.from({ length: 20 }, (_, i) => archive(i)))
  await expect(exporterRegistre('archives', lire, signal())).rejects.toThrow(
    'Pagination incohérente',
  )
  expect(lire).toHaveBeenCalledTimes(2)
})
test.each([1000, 1001])('vérifie la fin effective du registre de %i lignes', async (total) => {
  const lire = vi.fn(async (avant) => {
    const debut = avant ? Number(avant.slice(-12)) : 0
    return Array.from({ length: Math.min(20, total - debut) }, (_, i) => archive(debut + i + 1))
  })
  const resultat = exporterRegistre('archives', lire, signal())
  if (total === 1000) expect(await resultat).toContain(id(1000))
  else await expect(resultat).rejects.toBeInstanceOf(RegistreTropGrand)
  expect(lire).toHaveBeenCalledTimes(51)
})
test('annulation pendant la lecture : aucune page suivante', async () => {
  const controle = new AbortController()
  const lire = vi.fn(async () => {
    controle.abort()
    return [archive(1)]
  })
  await expect(exporterRegistre('archives', lire, controle.signal)).rejects.toThrow()
  expect(lire).toHaveBeenCalledTimes(1)
})
test('route privée, RPC authentifiée, projection minimale et nouvelle autorisation', async () => {
  const r = await appeler()
  expect(r.status).toBe(200)
  expect(contexte).toHaveBeenCalledTimes(2)
  expect(rpc).toHaveBeenCalledWith('archives_de_mon_agence', { avant: null })
  expect(lecture).toHaveBeenCalledWith(expect.any(AbortSignal))
  expect(r.headers.get('cache-control')).toBe('private, no-store')
  expect(r.headers.get('content-disposition')).toBe('attachment; filename="cloison-archives.csv"')
  expect(r.headers.get('content-type')).toBe('text/csv; charset=utf-8')
  expect(await r.text()).not.toContain('INTERDIT')
})
test('registre des règlements utilise sa RPC et son nom de fichier', async () => {
  lecture.mockResolvedValue({ data: [reglement], error: null })
  const r = await appeler('reglements')
  expect(r.status).toBe(200)
  expect(rpc).toHaveBeenCalledWith('factures_de_mon_agence', { avant: null })
  expect(r.headers.get('content-disposition')).toContain('cloison-reglements.csv')
})
test.each([
  { etat: 'anonyme' },
  { etat: 'non-rattache' },
  { ...c(), agence: { id: id(90), statut: 'decouverte' } },
])('refuse un accès non vérifié', async (ctx) => {
  contexte.mockResolvedValue(ctx)
  expect((await appeler()).status).toBe(403)
  expect(rpc).not.toHaveBeenCalled()
})
test.each([
  { etat: 'anonyme' },
  { ...c(), agence: { id: id(92), statut: 'verifiee' } },
  { ...c(), utilisateurId: id(93) },
  { ...c(), agence: { id: id(90), statut: 'suspendue' } },
])('révocation pendant la collecte : aucun fichier', async (ctx) => {
  contexte.mockResolvedValueOnce(c()).mockResolvedValueOnce(ctx)
  const r = await appeler()
  expect(r.status).toBe(403)
  expect(r.headers.get('content-disposition')).toBeNull()
  expect(await r.text()).toBe('Export indisponible.')
})
test('erreur MFA finale ne produit ni redirection HTML ni export', async () => {
  contexte.mockResolvedValueOnce(c()).mockRejectedValueOnce(new Error('SECRET MFA'))
  const r = await appeler()
  expect(r.status).toBe(503)
  expect(await r.text()).toBe('Export indisponible.')
})
test('panne après une page : refus sans données ni détail SQL', async () => {
  lecture
    .mockResolvedValueOnce({ data: Array.from({ length: 20 }, (_, i) => archive(i)), error: null })
    .mockResolvedValueOnce({ data: null, error: { message: 'SECRET SQL' } })
  const r = await appeler()
  expect(r.status).toBe(503)
  expect(await r.text()).toBe('Export indisponible.')
})
test('annulation du client : aucune collecte', async () => {
  const controle = new AbortController()
  controle.abort()
  expect((await appeler('archives', controle.signal)).status).toBe(503)
  expect(rpc).not.toHaveBeenCalled()
})
test('registre inconnu refusé avant authentification', async () => {
  expect((await appeler('autre')).status).toBe(404)
  expect(contexte).not.toHaveBeenCalled()
})
