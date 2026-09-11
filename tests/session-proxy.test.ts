import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, expect, test, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'https://auth.example.invalid',
    supabasePublishableKey: 'fixture-publique',
  },
}))
import { proxy } from '../proxy'
import { config } from '../proxy'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'

const UTILISATEUR = '11111111-1111-4111-8111-111111111111'
const COOKIE = 'sb-auth-auth-token'
const utilisateur = {
  id: UTILISATEUR,
  email: 'mfa@example.invalid',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2026-01-01T00:00:00Z',
  app_metadata: {},
  user_metadata: {},
}
function session(expiration: number, refreshToken: string) {
  const encoder = (objet: object) => Buffer.from(JSON.stringify(objet)).toString('base64url')
  const corps = `${encoder({ alg: 'HS256' })}.${encoder({ sub: UTILISATEUR, role: 'authenticated', aal: 'aal1', iat: expiration - 3600, exp: expiration })}`
  const signature = createHmac('sha256', 'secret-fictif-local').update(corps).digest('base64url')
  return {
    access_token: `${corps}.${signature}`,
    refresh_token: refreshToken,
    expires_at: expiration,
    expires_in: 3600,
    token_type: 'bearer',
    user: utilisateur,
  }
}
function cookiePour(session: object) {
  return `${COOKIE}=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
}
afterEach(() => vi.unstubAllGlobals())

for (const chemin of ['/espace/dossiers', '/connexion/securite']) {
  test(`${chemin} transmet le renouvellement SDK au navigateur et au rendu serveur`, async () => {
    const maintenant = Math.floor(Date.now() / 1000)
    const ancienne = session(maintenant - 60, 'ancien-fictif')
    const nouvelle = session(maintenant + 3600, 'nouveau-fictif')
    const appels: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options: RequestInit) => {
        const chemin = new URL(url).pathname
        appels.push(chemin)
        if (chemin === '/auth/v1/token') {
          expect(JSON.parse(String(options.body)).refresh_token).toBe('ancien-fictif')
          return new Response(JSON.stringify(nouvelle), { status: 200 })
        }
        expect(chemin).toBe('/auth/v1/user')
        expect(new Headers(options.headers).get('authorization')).toBe(
          `Bearer ${nouvelle.access_token}`,
        )
        return new Response(JSON.stringify(utilisateur), { status: 200 })
      }),
    )
    const reponse = await proxy(
      new NextRequest(`https://cloison.example.invalid${chemin}`, {
        headers: { Cookie: cookiePour(ancienne) },
      }),
    )
    const cookieNavigateur = reponse.cookies.get(COOKIE)?.value
    expect(cookieNavigateur).toBeDefined()
    expect(
      JSON.parse(Buffer.from(cookieNavigateur!.replace(/^base64-/, ''), 'base64url').toString())
        .refresh_token,
    ).toBe('nouveau-fictif')
    expect(reponse.headers.get('x-middleware-request-cookie')).toContain(
      `${COOKIE}=${cookieNavigateur}`,
    )
    expect(appels.filter((chemin) => chemin === '/auth/v1/token')).toHaveLength(1)
    expect(appels).toContain('/auth/v1/user')
    expect(reponse.headers.get('content-security-policy')).toContain("'nonce-")
  })
}

test('le parcours garant ne renouvelle pas une session agence incidente', async () => {
  const fetchFictif = vi.fn()
  vi.stubGlobal('fetch', fetchFictif)
  await proxy(
    new NextRequest('https://cloison.example.invalid/garant', {
      headers: { Cookie: cookiePour(session(1, 'ancien-fictif')) },
    }),
  )
  expect(fetchFictif).not.toHaveBeenCalled()
})

test.each([
  '/espace',
  '/espace/dossiers/abc',
  '/connexion/securite',
  '/locataire',
  '/garant',
  '/lien/abc',
  '/lien-invalide',
])('Next applique le proxy a %s', (url) => {
  expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true)
})
test.each([
  '/',
  '/demarrer',
  '/espace-public',
  '/api/paiement/webhook',
  '/_next/static/app.js',
  '/favicon.ico',
])('Next exclut %s du proxy applicatif', (url) => {
  expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false)
})
test('chaque requete porte un nonce neuf identique dans le rendu et la reponse', async () => {
  const a = await proxy(new NextRequest('https://cloison.example.invalid/garant'))
  const b = await proxy(new NextRequest('https://cloison.example.invalid/garant'))
  const politique = a.headers.get('content-security-policy')
  expect(politique).toMatch(/'nonce-[A-Za-z0-9+/]{22}=='/)
  expect(a.headers.get('x-middleware-request-content-security-policy')).toBe(politique)
  expect(politique).not.toBe(b.headers.get('content-security-policy'))
  expect(politique?.match(/script-src ([^;]+)/)?.[1]).not.toContain("'unsafe-inline'")
})
