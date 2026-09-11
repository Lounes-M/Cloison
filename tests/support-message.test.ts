import { expect, test } from 'vitest'
import { preparerMessageSupport } from '@/lib/support/message'
import { categoriesSupport, type EspaceSupport } from '@/lib/content/support-dossier'
const base = {
  adresse: 'support@example.invalid',
  reference: 'ABC12345',
  espace: 'locataire' as const,
  categorie: 'acces' as const,
}
test('le message contient uniquement la reference, le parcours et la categorie', () => {
  const r = preparerMessageSupport({
    ...base,
    email_garant: 'PRIVE',
    revenu: 999999,
    jeton: 'SECRET',
  } as typeof base)!
  expect(r.texte).toContain('ABC12345')
  expect(r.texte).toContain('Locataire')
  expect(r.texte).not.toMatch(/PRIVE|999999|SECRET/)
  const lien = new URL(r.lien)
  expect(lien.protocol).toBe('mailto:')
  expect(decodeURIComponent(lien.pathname)).toBe(base.adresse)
  expect([...lien.searchParams.keys()]).toEqual(['subject', 'body'])
  expect(lien.searchParams.get('body')).toBe(r.texte)
})
test.each(['garant', 'agence'] as EspaceSupport[])(
  'le paiement locataire ne peut etre propose a %s',
  (espace) => {
    expect(preparerMessageSupport({ ...base, espace, categorie: 'paiement' })).toBeNull()
    expect(categoriesSupport[espace]).not.toContain('paiement')
  },
)
test.each([
  'ABC\nBCC:autre@example.invalid',
  'abc?token=secret',
  '<script>alert(1)</script>',
  'court',
  'x'.repeat(33),
])('refuse une reference detournee %#', (reference) => {
  expect(preparerMessageSupport({ ...base, reference })).toBeNull()
})
test.each([
  'support@example.invalid?bcc=autre@example.invalid',
  'support@example.invalid\r\nBcc:autre@example.invalid',
  'javascript:alert(1)',
  '',
])('refuse une adresse detournee %#', (adresse) => {
  expect(preparerMessageSupport({ ...base, adresse })).toBeNull()
})
test('les caracteres de l adresse et du sujet ne creent pas de nouveaux destinataires', () => {
  const r = preparerMessageSupport({ ...base, adresse: 'support+pilote@example.invalid' })!
  const u = new URL(r.lien)
  expect(decodeURIComponent(u.pathname)).toBe('support+pilote@example.invalid')
  expect(u.searchParams.get('subject')).toBe(r.sujet)
  expect(u.searchParams.has('bcc')).toBe(false)
})
