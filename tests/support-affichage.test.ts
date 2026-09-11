import { afterEach, expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const d = vi.hoisted(() => ({ adresse: undefined as string | undefined }))
vi.mock('@/lib/env', () => ({
  env: {
    get emailSupport() {
      return d.adresse
    },
  },
}))
import { SupportDossier } from '@/components/dossiers/SupportDossier'
afterEach(() => {
  d.adresse = undefined
})
const rendre = () =>
  renderToStaticMarkup(createElement(SupportDossier, { reference: 'ABC12345', espace: 'garant' }))
test('aucun faux canal de support quand l adresse est absente', () => {
  expect(rendre()).toBe('')
})
test('une adresse invalide ne produit aucun lien exploitable', () => {
  d.adresse = 'javascript:alert(1)'
  expect(rendre()).toBe('')
})
test('le support du garant presente sa reference sans categorie de paiement', () => {
  d.adresse = 'support@example.invalid'
  const html = rendre()
  expect(html).toContain('ABC12345')
  expect(html).toContain('mailto:')
  expect(html).not.toContain('value="paiement"')
  expect(html).toMatch(/readonly=""/i)
  expect(html).not.toContain('type="file"')
})
