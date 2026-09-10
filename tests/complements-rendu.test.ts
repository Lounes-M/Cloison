import { expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
vi.mock('@/lib/agences/action-complement', () => ({
  modifierComplement: async () => ({ statut: 'enregistre' }),
}))
import { Complements } from '@/components/dossiers/Complements'
import type { Complement } from '@/lib/content/complements'
const demande: Complement = {
  id: '11111111-1111-4111-8111-111111111111',
  piece_initiale: '22222222-2222-4222-8222-222222222222',
  piece_fournie: null,
  nature: 'bulletin_paie',
  motif: 'illisible',
  etat: 'demande',
  cree_le: '2026-09-09T10:00:00Z',
  attendu_depuis: '2026-09-09T10:00:00Z',
}
const pieces = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    type: 'bulletin_paie',
    depose_le: '2026-09-09T11:00:00Z',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    type: 'bulletin_paie',
    depose_le: '2026-09-09T09:00:00Z',
  },
]
function rendre(agence: boolean, etat: Complement['etat'] = 'demande', modifiable = true) {
  return renderToStaticMarkup(
    createElement(Complements, {
      dossierId: '55555555-5555-4555-8555-555555555555',
      agence,
      modifiable,
      pieces,
      demandes: [{ ...demande, etat, piece_fournie: etat === 'demande' ? null : pieces[0]!.id }],
    }),
  )
}
test('le garant propose seulement un fichier posterieur a la demande', () => {
  const html = rendre(false)
  expect(html).toContain(`value="${pieces[0]!.id}"`)
  expect(html).not.toContain(pieces[1]!.id)
  expect(html).not.toContain('value="valider"')
})
test('un remplacement fourni attend un examen distinct de l agence', () => {
  const garant = rendre(false, 'fourni'),
    agence = rendre(true, 'fourni')
  expect(garant).not.toContain('<form')
  expect(agence).toContain('value="valider"')
  expect(agence).toContain('value="refuser"')
  expect(agence).toContain(`/espace/pieces/${pieces[0]!.id}`)
})
test('un dossier ferme conserve le suivi sans formulaire de modification', () => {
  expect(rendre(true, 'fourni', false)).not.toContain('<form')
  expect(rendre(false, 'demande', false)).not.toContain('<form')
})
test('apercus optionnels des composants reels sur fixtures', () => {
  const destination = process.env.CLOISON_APERCUS_COMPLEMENTS
  if (!destination) return
  mkdirSync(destination, { recursive: true })
  for (const agence of [false, true])
    writeFileSync(
      join(destination, agence ? 'agence.html' : 'garant.html'),
      rendre(agence, agence ? 'fourni' : 'demande'),
    )
})
