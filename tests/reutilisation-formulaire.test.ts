import { expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/lib/garant/action-reutilisation', () => ({
  listerPiecesReutilisables: vi.fn(),
  copierPiece: vi.fn(),
}))
import { FormulaireReutilisation } from '@/components/forms/FormulaireReutilisation'

test('le lien source n est pas controle : une saisie avant l hydratation reste', () => {
  const html = renderToStaticMarkup(createElement(FormulaireReutilisation, { dossierId: 'd' }))
  const champ = html.match(/<input[^>]*name="lien_source"[^>]*>/)?.[0]
  expect(champ).toBeDefined()
  // Un champ controle serait rendu avec value="" et vide au premier rendu client.
  expect(champ).not.toMatch(/\svalue=/)
})
