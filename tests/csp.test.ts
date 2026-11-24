import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  PAGES_NONCE_PUBLIQUES,
  SEGMENTS_APPLICATIFS,
  nouveauNonce,
  politiqueAvecNonce,
  politiqueStatique,
  sourcePolitiqueStatique,
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

  /** Le `matcher` du proxy, tel que Next le lit : ecrit en clair. */
  function motifsDuMiddleware(): string[] {
    const source = readFileSync(join(racine, 'proxy.ts'), 'utf8')
    const bloc = /matcher:\s*\[([^\]]*)\]/.exec(source)
    expect(bloc, 'le matcher du proxy doit etre un tableau litteral').not.toBeNull()
    return [...bloc![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!)
  }

  test('la liste, le proxy et les dossiers disent la meme chose', () => {
    const attendus = [...SEGMENTS_APPLICATIFS].sort()
    const motifs = motifsDuMiddleware()
    const pages = [...PAGES_NONCE_PUBLIQUES].map((page) => `${page}/:path*`)
    const segments = motifs
      .filter((motif) => !pages.includes(motif))
      .map((motif) => motif.slice(1, motif.indexOf('/:path*')))
      .sort()
    expect(segmentsSurLeDisque()).toEqual(attendus)
    expect(segments).toEqual(attendus)
    expect(motifs.filter((motif) => pages.includes(motif)).sort()).toEqual([...pages].sort())
  })

  test('l exclusion du site public couvre l applicatif et l ouverture', () => {
    const config = readFileSync(join(racine, 'next.config.ts'), 'utf8')
    expect(config).toContain('sourcePolitiqueStatique()')
    const exclusion = new RegExp(`^${sourcePolitiqueStatique()}`)
    for (const segment of SEGMENTS_APPLICATIFS) {
      expect(exclusion.test(`/${segment}`), segment).toBe(false)
      expect(exclusion.test(`/${segment}/quelque-chose`), segment).toBe(false)
    }
    for (const page of PAGES_NONCE_PUBLIQUES) {
      expect(exclusion.test(page), page).toBe(false)
      expect(exclusion.test(`${page}/suite`), page).toBe(false)
    }
    for (const publique of ['/', '/agences', '/en', '/en/agences', '/garanties', '/lienvers']) {
      expect(exclusion.test(publique), publique).toBe(true)
    }
  })
})
