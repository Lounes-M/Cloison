import { beforeEach, expect, test, vi } from 'vitest'
const { executer } = vi.hoisted(() => ({ executer: vi.fn() }))
vi.mock('@/lib/coffre/processus-limite', () => ({ executerProcessus: executer }))
import { traiterDocument } from '@/lib/coffre/traitement-document'

beforeEach(() => executer.mockReset())

const pdf = Buffer.from('%PDF-1.7\nfixture de protocole')

test('les deux reponses normales conservent leur contrat', async () => {
  executer.mockResolvedValueOnce(Buffer.from(JSON.stringify({ ok: true })))
  expect(await traiterDocument(pdf, 'application/pdf', '', 'verifier')).toEqual(Buffer.alloc(0))
  executer.mockResolvedValueOnce(
    Buffer.from(JSON.stringify({ ok: true, pdf: pdf.toString('base64') })),
  )
  expect(await traiterDocument(pdf, 'application/pdf', 'Agence', 'rasteriser')).toEqual(pdf)
})

test.each([
  { ok: true, pdf: pdf.toString('base64') },
  { ok: true, pages: 0 },
  { ok: true, erreur: 'contenu_prive_fictif' },
])('la verification refuse un succes avec une charge inattendue : %j', async (reponse) => {
  executer.mockResolvedValue(Buffer.from(JSON.stringify(reponse)))
  await expect(traiterDocument(pdf, 'application/pdf', '', 'verifier')).rejects.toThrow(
    'Reponse du moteur documentaire invalide',
  )
})

test.each([
  pdf.toString('base64') + '!contenu!invalide!',
  ' ' + pdf.toString('base64'),
  pdf.toString('base64').replace(/=+$/, ''),
  pdf.toString('base64') + '====',
  pdf.toString('base64').replace(/U=$/, 'V='),
])('la rasterisation refuse un encodage non canonique : %s', async (base64) => {
  executer.mockResolvedValue(Buffer.from(JSON.stringify({ ok: true, pdf: base64 })))
  await expect(traiterDocument(pdf, 'application/pdf', '', 'rasteriser')).rejects.toThrow(
    'Sortie documentaire invalide',
  )
})

test.each([null, [], { ok: 'true' }, { ok: true, pdf: 12 }, { ok: true, pdf: '' }])(
  'une reponse mal formee est refusee : %j',
  async (reponse) => {
    executer.mockResolvedValue(Buffer.from(JSON.stringify(reponse)))
    await expect(traiterDocument(pdf, 'application/pdf', '', 'rasteriser')).rejects.toThrow()
  },
)

test('une rasterisation avec des champs supplementaires est refusee', async () => {
  executer.mockResolvedValue(
    Buffer.from(JSON.stringify({ ok: true, pdf: pdf.toString('base64'), pages: 1 })),
  )
  await expect(traiterDocument(pdf, 'application/pdf', '', 'rasteriser')).rejects.toThrow(
    'Reponse du moteur documentaire invalide',
  )
})

test('un refus connu conserve uniquement le nombre de pages controle', async () => {
  executer.mockResolvedValue(Buffer.from(JSON.stringify({ ok: false, pages: 41 })))
  await expect(traiterDocument(pdf, 'application/pdf', '', 'verifier')).rejects.toThrow(
    'Ce document compte 41 pages, au-dela des 40 traitees',
  )
  executer.mockResolvedValue(Buffer.from(JSON.stringify({ ok: false, pages: null })))
  await expect(traiterDocument(pdf, 'application/pdf', '', 'verifier')).rejects.toThrow(
    'Document invalide ou trop volumineux a traiter',
  )
})

test('les octets autres que PDF restent refuses', async () => {
  executer.mockResolvedValue(
    Buffer.from(
      JSON.stringify({ ok: true, pdf: Buffer.from('contenu_prive_fictif').toString('base64') }),
    ),
  )
  await expect(traiterDocument(pdf, 'application/pdf', '', 'rasteriser')).rejects.toThrow(
    'Sortie documentaire invalide',
  )
})

test.each([
  { ok: false },
  { ok: false, pages: 'contenu_prive_fictif' },
  { ok: false, pages: -1 },
  { ok: false, pages: 41.5 },
  { ok: false, pages: Number.MAX_SAFE_INTEGER + 1 },
  { ok: false, pages: 41, pdf: pdf.toString('base64') },
])('un refus incoherent ne produit pas de diagnostic documentaire : %j', async (reponse) => {
  executer.mockResolvedValue(Buffer.from(JSON.stringify(reponse)))
  await expect(traiterDocument(pdf, 'application/pdf', '', 'verifier')).rejects.toThrow(
    'Reponse du moteur documentaire invalide',
  )
})

test('le plafond porte aussi sur les octets decodes, meme a longueur Base64 egale', async () => {
  const limite = Buffer.alloc(20 * 1024 * 1024)
  limite.write('%PDF-')
  const depassement = Buffer.concat([limite, Buffer.from([0])])
  expect(limite.toString('base64').length).toBe(depassement.toString('base64').length)
  executer.mockResolvedValueOnce(
    Buffer.from(JSON.stringify({ ok: true, pdf: limite.toString('base64') })),
  )
  const sortie = await traiterDocument(pdf, 'application/pdf', '', 'rasteriser')
  expect(sortie.equals(limite)).toBe(true)
  executer.mockResolvedValueOnce(
    Buffer.from(JSON.stringify({ ok: true, pdf: depassement.toString('base64') })),
  )
  await expect(traiterDocument(pdf, 'application/pdf', '', 'rasteriser')).rejects.toThrow(
    'Sortie documentaire invalide',
  )
})

test('une sortie invalide ne divulgue pas son contenu dans l erreur journalisable', async () => {
  executer.mockResolvedValue(Buffer.from('revenu_12345'))
  await expect(
    traiterDocument(Buffer.from('test'), 'application/pdf', '', 'verifier'),
  ).rejects.not.toThrow('revenu_12345')
})
