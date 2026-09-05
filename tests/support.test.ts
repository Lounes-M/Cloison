import { afterEach, describe, expect, test } from 'vitest'
import { support } from '@/lib/content/espace'
import { env } from '@/lib/env'

/**
 * L'adresse de support.
 *
 * Ce qui se teste : tant qu'elle n'est pas fixee, rien ne la remplace. Une
 * adresse de repli inventee ici serait une promesse que personne ne tient.
 */

describe('l adresse de support', () => {
  const avant = process.env.EMAIL_SUPPORT

  afterEach(() => {
    if (avant === undefined) delete process.env.EMAIL_SUPPORT
    else process.env.EMAIL_SUPPORT = avant
  })

  test('absente, elle vaut rien, et pas une adresse par defaut', () => {
    delete process.env.EMAIL_SUPPORT
    expect(env.emailSupport).toBeNull()
  })

  test('vide ou blanche, elle vaut rien aussi', () => {
    for (const valeur of ['', '   ']) {
      process.env.EMAIL_SUPPORT = valeur
      expect(env.emailSupport).toBeNull()
    }
  })

  test('posee, elle est rendue sans ses espaces', () => {
    process.env.EMAIL_SUPPORT = '  support@cloison.immo '
    expect(env.emailSupport).toBe('support@cloison.immo')
  })

  test('le texte de l espace agence la porte, avec le delai promis', () => {
    const texte = support.texte('support@cloison.immo')
    expect(texte).toContain('support@cloison.immo')
    expect(texte).toContain('quatre heures ouvrées')
    expect(texte).toContain('un jour ouvré')
  })
})
