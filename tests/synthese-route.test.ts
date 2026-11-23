import { beforeEach, expect, test, vi } from 'vitest'
import type { NextRequest } from 'next/server'

import { GET } from '@/app/(agence)/espace/dossiers/[id]/synthese/route'
import { synthese as t } from '@/lib/content/synthese'

const contexte = vi.hoisted(() => vi.fn())
const produire = vi.hoisted(() => vi.fn())
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: contexte }))
vi.mock('@/lib/dossiers/synthese-agence', () => ({ synthesePourLeBailleur: produire }))

const id = '11111111-1111-4111-8111-111111111111'
const supabase = {}
const requete = new Request(`https://cloison.test/espace/dossiers/${id}/synthese`) as NextRequest
const appeler = (identifiant = id) => GET(requete, { params: Promise.resolve({ id: identifiant }) })

beforeEach(() => {
  vi.clearAllMocks()
  contexte.mockResolvedValue({ etat: 'rattache', supabase, email: 'prenom.nom@agence.invalid' })
  produire.mockResolvedValue({ ok: true, pdf: Buffer.from('%PDF-1.7'), reference: 'CLS-7H2K-9QXM' })
})

test('un identifiant mal forme est refuse avant toute lecture', async () => {
  expect((await appeler('invalide')).status).toBe(404)
  expect(contexte).not.toHaveBeenCalled()
  expect(produire).not.toHaveBeenCalled()
})

test.each(['anonyme', 'non-rattache'])('le contexte %s ne produit rien', async (etat) => {
  contexte.mockResolvedValue({ etat })
  expect((await appeler()).status).toBe(401)
  expect(produire).not.toHaveBeenCalled()
})

test('la synthese part au nom de la personne connectee, en piece jointe et sans cache', async () => {
  const reponse = await appeler()
  expect(reponse.status).toBe(200)
  expect(produire).toHaveBeenCalledWith(supabase, id, 'prenom.nom@agence.invalid', 'fr')
  expect(reponse.headers.get('content-type')).toBe('application/pdf')
  expect(reponse.headers.get('cache-control')).toBe('no-store')
  expect(reponse.headers.get('content-disposition')).toBe(
    'attachment; filename="synthese-bailleur-CLS-7H2K-9QXM.pdf"',
  )
  expect(Buffer.from(await reponse.arrayBuffer()).toString()).toBe('%PDF-1.7')
})

test('un refus se lit comme une absence, et ne rend aucun PDF', async () => {
  produire.mockResolvedValue({ ok: false, motif: 'refus' })
  const reponse = await appeler()
  expect(reponse.status).toBe(404)
  expect(reponse.headers.get('content-type')).toContain('text/plain')
  expect(await reponse.text()).toBe(t.refus)
})

test('une panne de production ne rend pas la page sans filigrane', async () => {
  produire.mockResolvedValue({ ok: false, motif: 'indisponible' })
  const reponse = await appeler()
  expect(reponse.status).toBe(503)
  expect(await reponse.text()).toBe(t.indisponible)
})
