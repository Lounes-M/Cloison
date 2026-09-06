import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createHmac } from 'node:crypto'

// Executer depuis le depot, apres npm run build. Vrai Next et vrai SDK Supabase,
// service Auth fictif sur loopback. Aucun compte ni code OTP reel n'est utilise.
const utilisateurId = '11111111-1111-4111-8111-111111111111'
const maintenant = Math.floor(Date.now() / 1000)
function jwt(expiration) {
  const encoder = (objet) => Buffer.from(JSON.stringify(objet)).toString('base64url')
  const corps = `${encoder({ alg: 'HS256' })}.${encoder({ sub: utilisateurId, role: 'authenticated', aal: 'aal1', iat: maintenant - 100, exp: expiration })}`
  return `${corps}.${createHmac('sha256', 'fixture-sans-valeur').update(corps).digest('base64url')}`
}
const utilisateur = {
  id: utilisateurId,
  email: 'essai@example.invalid',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {},
  factors: [
    {
      id: utilisateurId,
      factor_type: 'totp',
      status: 'verified',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
}
const nouvelleSession = {
  access_token: jwt(maintenant + 3600),
  refresh_token: 'nouveau-fictif',
  expires_in: 3600,
  expires_at: maintenant + 3600,
  token_type: 'bearer',
  user: utilisateur,
}
let renouvellements = 0
const api = createServer(async (requete, reponse) => {
  // Vider le corps sans le conserver ni le journaliser.
  for await (const bloc of requete) void bloc
  reponse.setHeader('Content-Type', 'application/json')
  if (requete.url.startsWith('/auth/v1/token')) {
    renouvellements++
    reponse.end(JSON.stringify(nouvelleSession))
  } else if (requete.url.startsWith('/auth/v1/user')) {
    reponse.end(JSON.stringify(utilisateur))
  } else reponse.writeHead(404).end('{}')
})
api.listen(0, '127.0.0.1')
await once(api, 'listening')
const reservation = createServer()
reservation.listen(0, '127.0.0.1')
await once(reservation, 'listening')
const port = reservation.address().port
await new Promise((resolve) => reservation.close(resolve))
const site = `http://127.0.0.1:${port}`
const next = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      SUPABASE_URL: `http://127.0.0.1:${api.address().port}`,
      SUPABASE_PUBLISHABLE_KEY: 'fixture',
      SUPABASE_JWT_SECRET: 'fixture',
    },
    stdio: 'ignore',
  },
)
try {
  let pret = false
  for (let i = 0; i < 80; i++) {
    try {
      const reponse = await fetch(site, { signal: AbortSignal.timeout(500), redirect: 'error' })
      if (reponse.ok) {
        pret = true
        break
      }
    } catch {
      /* Demarrage. */
    }
    if (next.exitCode !== null) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert(pret, 'Build Next local indisponible')
  const ancienneSession = {
    ...nouvelleSession,
    access_token: jwt(maintenant - 30),
    refresh_token: 'ancien-fictif',
    expires_at: maintenant - 30,
  }
  const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(ancienneSession)).toString('base64url')}`
  const reponse = await fetch(`${site}/connexion/securite`, {
    headers: { Cookie: cookie },
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  })
  const html = await reponse.text()
  assert.equal(reponse.status, 200, 'Page MFA non rendue')
  assert(html.includes('one-time-code'), 'Formulaire OTP absent')
  const cookieRendu = reponse.headers.get('set-cookie')
  assert(cookieRendu?.includes('sb-127-auth-token=base64-'), 'Session renouvelee perdue')
  assert.equal(renouvellements, 1, 'Les composants reutilisent une session perimee')
  const valeur = /sb-127-auth-token=base64-([^;]+)/.exec(cookieRendu)[1]
  assert.equal(
    JSON.parse(Buffer.from(valeur, 'base64url').toString()).refresh_token,
    'nouveau-fictif',
  )
  console.log('OK : page MFA Next, un renouvellement SDK, cookie frais rendu au navigateur')
  console.log(
    'Limite : serveur Auth fictif ; aucune validation du service MFA reel ou du navigateur',
  )
} finally {
  next.kill('SIGTERM')
  if (next.exitCode === null) await once(next, 'exit')
  api.closeAllConnections()
  await new Promise((resolve) => api.close(resolve))
}
