import { afterEach, expect, test, vi } from 'vitest'
import { verifierProduction } from '../scripts/verifier-production.mjs'

let sequence = 0
function fixture(adresse: string) {
  const chemin = new URL(adresse).pathname
  const prive = ['/connexion', '/espace', '/garant', '/locataire'].includes(chemin)
  const nonce = Buffer.from(String(++sequence).padStart(16, '0')).toString('base64')
  const headers = new Headers({
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'cross-origin-opener-policy': 'same-origin',
    'strict-transport-security': 'max-age=63072000; includeSubDomains',
    'cache-control': 'private, no-store',
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': `default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests; script-src ${prive ? `'nonce-${nonce}' 'strict-dynamic' 'self'` : "'self' 'unsafe-inline'"}`,
  })
  if (chemin.startsWith('/api/')) return new Response(null, { status: 401, headers })
  if (['/espace', '/garant', '/locataire'].includes(chemin)) {
    headers.set('location', chemin === '/espace' ? '/connexion' : '/lien-invalide')
    return new Response(null, { status: 307, headers })
  }
  const titre =
    chemin === '/'
      ? 'Cloison · Le coffre à trois clés'
      : chemin === '/agences'
        ? 'Agences · Cloison'
        : 'Connexion · Cloison'
  return new Response(
    `<html lang="fr"><head><title>${titre}</title><meta name="robots" content="noindex, nofollow"/></head><body><main><h1>Contenu fictif</h1></main></body></html>`,
    { headers },
  )
}
afterEach(() => vi.restoreAllMocks())

test('controle les pages et les refus sur une origine fixe sans identifiants', async () => {
  const transport = vi.fn<typeof fetch>().mockImplementation(async (url) => fixture(String(url)))
  const rapport = await verifierProduction(transport)
  expect(rapport.conforme).toBe(true)
  expect(rapport.controles).toHaveLength(12)
  expect(transport).toHaveBeenCalledTimes(12)
  for (const [url, options] of transport.mock.calls) {
    expect(new URL(String(url)).origin).toBe('https://www.cloison.immo')
    expect(options).toMatchObject({
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      cache: 'no-store',
    })
    expect(options?.headers).toBeUndefined()
    expect(options?.body).toBeUndefined()
  }
})

test.each([
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'cross-origin-opener-policy',
  'strict-transport-security',
  'content-security-policy',
])('detecte la perte de %s', async (entete) => {
  const rapport = await verifierProduction(async (url) => {
    const r = fixture(String(url))
    r.headers.delete(entete)
    return r
  })
  expect(rapport.conforme).toBe(false)
  expect(rapport.controles.every((c) => !c.conforme)).toBe(true)
})

test.each([
  "default-src 'self'; object-src 'none'; base-uri 'self'; upgrade-insecure-requests; script-src 'self' 'unsafe-inline'",
  "default-src *; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests; script-src 'self' 'unsafe-inline'",
  "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests; script-src 'self' 'unsafe-inline' 'unsafe-eval'",
])('refuse une CSP incomplete ou permissive %#', async (csp) => {
  const rapport = await verifierProduction(async (url) => {
    const r = fixture(String(url))
    r.headers.set('content-security-policy', csp)
    return r
  })
  expect(rapport.conforme).toBe(false)
})

test('detecte un nonce reutilise entre deux requetes de connexion', async () => {
  let csp: string | null = null
  const rapport = await verifierProduction(async (url) => {
    const r = fixture(String(url))
    if (String(url).endsWith('/connexion')) {
      csp ??= r.headers.get('content-security-policy')
      r.headers.set('content-security-policy', csp!)
    }
    return r
  })
  expect(rapport.controles.find((c) => c.id === 'connexion')?.conforme).toBe(true)
  expect(rapport.controles.find((c) => c.id === 'nonce-renouvele')?.conforme).toBe(false)
})

test.each(['cache', 'acces', 'redirection'])(
  'detecte une regression des frontieres : %s',
  async (cas) => {
    const rapport = await verifierProduction(async (url) => {
      const r = fixture(String(url))
      if (cas === 'cache') r.headers.delete('cache-control')
      if (cas === 'redirection') r.headers.set('location', 'https://intrus.invalid/prive')
      if (cas === 'acces' && String(url).includes('/api/'))
        return new Response('PRIVE', { headers: r.headers })
      return r
    })
    expect(rapport.conforme).toBe(false)
    expect(JSON.stringify(rapport)).not.toContain('PRIVE')
  },
)

test.each(['titre', 'robots', 'langue', 'tronque', 'taille', 'utf8'])(
  'refuse une page incorrecte : %s',
  async (cas) => {
    const rapport = await verifierProduction(async (url) => {
      const r = fixture(String(url))
      if (!String(url).endsWith('/connexion')) return r
      let html = await r.text()
      if (cas === 'titre') html = html.replace('Connexion · Cloison', 'Erreur')
      if (cas === 'robots') html = html.replace('noindex, nofollow', 'index, follow')
      if (cas === 'langue') html = html.replace('lang="fr"', 'lang="en"')
      if (cas === 'tronque') html = '<html lang="fr"><head></head></html>'
      if (cas === 'taille') html += 'x'.repeat(1024 * 1024)
      return new Response(cas === 'utf8' ? Buffer.from([255]) : html, { headers: r.headers })
    })
    expect(rapport.controles.find((c) => c.id === 'connexion')?.conforme).toBe(false)
  },
)

test('ne suit jamais une redirection distante et nettoie le corps refuse', async () => {
  const annuler = vi.fn()
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async () =>
        new Response(new ReadableStream({ cancel: annuler }), {
          status: 302,
          headers: { location: 'https://intrus.invalid' },
        }),
    )
  const rapport = await verifierProduction(transport)
  expect(rapport.conforme).toBe(false)
  expect(annuler).toHaveBeenCalledTimes(12)
  expect(
    transport.mock.calls.every(([url]) => String(url).startsWith('https://www.cloison.immo/')),
  ).toBe(true)
})

test('annule un corps bloque et ne lance plus de requete apres le budget global', async () => {
  const controle = new AbortController()
  const annuler = vi.fn()
  const transport = vi.fn<typeof fetch>().mockImplementation(
    async (url) =>
      new Response(
        new ReadableStream({
          pull() {
            controle.abort()
          },
          cancel: annuler,
        }),
        { headers: fixture(String(url)).headers },
      ),
  )
  const rapport = await verifierProduction(transport, controle.signal)
  expect(rapport.conforme).toBe(false)
  expect(rapport.controles.every((c) => !c.conforme)).toBe(true)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(annuler).toHaveBeenCalledTimes(1)
})

test('un echec reseau reste visible sans divulguer son erreur et les autres controles continuent', async () => {
  const rapport = await verifierProduction(async (url) => {
    if (String(url).endsWith('/agences')) throw new Error('SECRET_CONFIDENTIEL')
    return fixture(String(url))
  })
  expect(rapport.conforme).toBe(false)
  expect(rapport.controles.filter((c) => !c.conforme).map((c) => c.id)).toEqual(['agences'])
  expect(JSON.stringify(rapport)).not.toContain('SECRET_CONFIDENTIEL')
})
