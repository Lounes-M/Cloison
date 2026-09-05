import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  SEGMENTS_APPLICATIFS,
  nouveauNonce,
  politiqueAvecNonce,
  politiqueStatique,
} from '@/lib/securite/csp'

/**
 * La Content-Security-Policy.
 *
 * Ce qui se teste ici n'est pas qu'une politique existe, mais qu'elle
 * interdit ce qu'elle doit interdire, et qu'aucune page de l'applicatif ne
 * puisse tomber, par oubli, sous la politique du site public, celle qui
 * laisse passer les scripts en ligne.
 */

const racine = join(import.meta.dirname, '..')

function directives(politique: string): Map<string, string> {
  return new Map(
    politique.split(';').map((d) => {
      const [nom, ...valeurs] = d.trim().split(/\s+/)
      return [nom!, valeurs.join(' ')]
    }),
  )
}

describe('la politique de l applicatif', () => {
  const nonce = nouveauNonce()
  const d = directives(politiqueAvecNonce(nonce, true))

  test('un script sans nonce ne s execute pas', () => {
    const scripts = d.get('script-src')!
    expect(scripts).toContain(`'nonce-${nonce}'`)
    expect(scripts).toContain(`'strict-dynamic'`)
    expect(scripts).not.toContain(`'unsafe-inline'`)
    expect(scripts).not.toContain(`'unsafe-eval'`)
  })

  test('aucun tiers n encadre une page, et rien ne s y encadre', () => {
    expect(d.get('frame-ancestors')).toBe(`'none'`)
    expect(d.get('frame-src')).toBe(`'none'`)
    expect(d.get('object-src')).toBe(`'none'`)
    expect(d.get('base-uri')).toBe(`'self'`)
  })

  test('les formulaires ne soumettent qu a nous, et au paiement', () => {
    expect(d.get('form-action')).toBe(`'self' https://checkout.stripe.com`)
  })

  test('rien ne part vers un autre hote', () => {
    expect(d.get('connect-src')).toBe(`'self'`)
    expect(d.get('default-src')).toBe(`'self'`)
    expect(d.get('upgrade-insecure-requests')).toBe('')
  })

  test('un nonce trop court ou mal forme est refuse', () => {
    for (const mauvais of ['', 'court', "abc'; script-src *", 'a'.repeat(15)]) {
      expect(() => politiqueAvecNonce(mauvais, true)).toThrow('Nonce CSP invalide')
    }
  })

  test('deux nonces ne se repetent pas', () => {
    const tires = new Set(Array.from({ length: 200 }, () => nouveauNonce()))
    expect(tires.size).toBe(200)
    for (const n of tires) expect(n).toMatch(/^[A-Za-z0-9+/=]{16,}$/)
  })
})

describe('la politique du site public', () => {
  const d = directives(politiqueStatique(true))

  test('elle admet les scripts en ligne de Next, et rien d autre', () => {
    // Le site public est prerendu : pas de nonce possible. C'est la concession
    // documentee, et elle ne vaut que la ou aucun tiers ne saisit rien.
    expect(d.get('script-src')).toBe(`'self' 'unsafe-inline'`)
    expect(d.get('script-src')).not.toContain(`'unsafe-eval'`)
  })

  test('elle interdit la meme chose que l applicatif pour le reste', () => {
    expect(d.get('frame-ancestors')).toBe(`'none'`)
    expect(d.get('object-src')).toBe(`'none'`)
    expect(d.get('connect-src')).toBe(`'self'`)
    expect(d.get('form-action')).toBe(`'self'`)
  })

  test('en developpement seulement, le rechargement a chaud passe', () => {
    const dev = directives(politiqueStatique(false))
    expect(dev.get('script-src')).toContain(`'unsafe-eval'`)
    expect(dev.get('connect-src')).toContain('ws:')
    expect(dev.has('upgrade-insecure-requests')).toBe(false)
  })
})

describe('aucune page de l applicatif ne tombe sous la politique du site public', () => {
  /** Les segments d'URL de premier niveau sous les groupes applicatifs. */
  function segmentsSurLeDisque(): string[] {
    return ['(agence)', '(porteur)']
      .flatMap((groupe) =>
        readdirSync(join(racine, 'app', groupe), { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name),
      )
      .sort()
  }

  /** Le `matcher` du middleware, tel que Next le lit : ecrit en clair. */
  function segmentsDuMiddleware(): string[] {
    const source = readFileSync(join(racine, 'middleware.ts'), 'utf8')
    const bloc = /matcher:\s*\[([^\]]*)\]/.exec(source)
    expect(bloc, 'le matcher du middleware doit etre un tableau litteral').not.toBeNull()
    return [...bloc![1]!.matchAll(/'\/([^/']+)\/:path\*'/g)].map((m) => m[1]!).sort()
  }

  test('la liste, le middleware et les dossiers disent la meme chose', () => {
    const attendus = [...SEGMENTS_APPLICATIFS].sort()
    expect(segmentsSurLeDisque()).toEqual(attendus)
    expect(segmentsDuMiddleware()).toEqual(attendus)
  })

  test('l exclusion du site public couvre exactement ces segments', () => {
    // La meme expression que `next.config.ts`, qui refuse les groupes capturants.
    const exclusion = new RegExp(`^/(?!(?:${SEGMENTS_APPLICATIFS.join('|')})(?:/|$)).*`)
    for (const segment of SEGMENTS_APPLICATIFS) {
      expect(exclusion.test(`/${segment}`), segment).toBe(false)
      expect(exclusion.test(`/${segment}/quelque-chose`), segment).toBe(false)
    }
    for (const publique of ['/', '/agences', '/demarrer', '/garanties', '/lienvers']) {
      expect(exclusion.test(publique), publique).toBe(true)
    }
  })
})
