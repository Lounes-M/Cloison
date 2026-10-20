import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { isValidElement, type ReactNode } from 'react'

const doublures = vi.hoisted(() => ({ contexte: vi.fn(), payer: vi.fn() }))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: doublures.contexte }))
vi.mock('@/lib/paiement/action-acte', () => ({ payerActe: doublures.payer }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('introuvable')
  },
}))

import PageFacturation from '@/app/(agence)/espace/facturation/page'

const ligne = (id: string, etat: string, anomalie: boolean, paye_le: string | null = null) => ({
  id,
  montant_cents: 2900,
  cree_le: '2026-10-01T12:00:00Z',
  paye_le,
  tarif_version: 'recette',
  etat,
  anomalie,
})
const A_REGLER = '11111111-1111-4111-8111-111111111111'

function champs(noeud: ReactNode): string[] {
  if (Array.isArray(noeud)) return noeud.flatMap(champs)
  if (!isValidElement<{ children?: ReactNode; name?: string; value?: unknown }>(noeud)) return []
  if (noeud.type === 'input') return [`${noeud.props.name}=${noeud.props.value}`]
  return champs(noeud.props.children)
}

function parcourir(noeud: ReactNode, formulaires: string[], textes: string[]) {
  if (Array.isArray(noeud)) noeud.forEach((n) => parcourir(n, formulaires, textes))
  else if (typeof noeud === 'string') textes.push(noeud)
  else if (isValidElement<{ children?: ReactNode; action?: unknown }>(noeud)) {
    if (noeud.type === 'form' && noeud.props.action === doublures.payer)
      formulaires.push(champs(noeud.props.children).join(','))
    else parcourir(noeud.props.children, formulaires, textes)
  }
}

async function rendre() {
  const formulaires: string[] = []
  const textes: string[] = []
  parcourir(await PageFacturation({ searchParams: Promise.resolve({}) }), formulaires, textes)
  return { formulaires, textes }
}

beforeEach(() => {
  doublures.contexte.mockResolvedValue({
    etat: 'rattache',
    agence: { statut: 'verifiee' },
    supabase: {
      rpc: async () => ({
        data: [
          ligne(A_REGLER, 'a_regler', false),
          ligne('22222222-2222-4222-8222-222222222222', 'litige', true),
          ligne('33333333-3333-4333-8333-333333333333', 'paye', false, '2026-10-02T12:00:00Z'),
        ],
        error: null,
      }),
    },
  })
})
afterEach(() => {
  vi.unstubAllEnvs()
})

test('le reglement ferme ne propose aucun paiement et le signale', async () => {
  vi.stubEnv('FACTURATION_ACTES_ENABLED', 'false')
  const { formulaires, textes } = await rendre()
  expect(formulaires).toEqual([])
  expect(textes).toContain('Le règlement en ligne n’est pas encore ouvert.')
})

test('le reglement ouvert ne propose que la facture a regler, sans anomalie ni doublon', async () => {
  vi.stubEnv('FACTURATION_ACTES_ENABLED', 'true')
  const { formulaires, textes } = await rendre()
  expect(formulaires).toEqual([`facture=${A_REGLER},montant=2900,tarif=recette`])
  expect(textes).not.toContain('Le règlement en ligne n’est pas encore ouvert.')
})
