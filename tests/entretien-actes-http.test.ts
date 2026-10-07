import { createServer } from 'node:http'
import { expect, test, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { creerEntretienActes } from '@/lib/exploitation/entretien-actes'

test('le SDK reel classe une erreur de passerelle HTML et rejoue le meme RPC sans fournisseur', async () => {
  const journal = vi.spyOn(console, 'error').mockImplementation(() => {})
  const chemins: (string | undefined)[] = []
  const serveur = createServer((req, res) => {
    chemins.push(req.url)
    if (chemins.length === 1) {
      res.writeHead(504, { 'Content-Type': 'text/html' })
      res.end('<html>DETAIL_PRIVE_FICTIF</html>')
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('0')
    }
  })
  try {
    await new Promise<void>((resolve) => serveur.listen(0, '127.0.0.1', resolve))
    const adresse = serveur.address()
    if (!adresse || typeof adresse === 'string') throw new Error('Port fictif absent')
    const signal = AbortSignal.timeout(5000)
    const db = createClient(`http://127.0.0.1:${adresse.port}`, 'cle-publique-fictive', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, options) => fetch(input, { ...options, signal }) },
    })
    expect((await creerEntretienActes(db, signal).expirer()).data).toBe(0)
    expect(chemins).toEqual([
      '/rest/v1/rpc/expirer_archives_signature',
      '/rest/v1/rpc/expirer_archives_signature',
    ])
    expect(JSON.stringify(journal.mock.calls)).not.toContain('DETAIL_PRIVE_FICTIF')
    expect(journal.mock.calls).toContainEqual([
      '[actes] transport en echec',
      'expiration',
      'passerelle_indisponible',
    ])
  } finally {
    serveur.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      serveur.close((err) => (err ? reject(err) : resolve())),
    )
    journal.mockRestore()
  }
})
