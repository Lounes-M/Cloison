import { expect, test } from 'vitest'
import { createServer } from 'node:http'
import { request } from 'node:https'
import { once } from 'node:events'
import { ouvrirRelaisLocal } from '../scripts/https-parcours-local.mjs'

test.each(['https://127.0.0.1', 'http://example.invalid', 'http://192.0.2.1'])(
  'le relais refuse une origine autre que le serveur HTTP local : %s',
  async (site) => {
    const accepte = await ouvrirRelaisLocal(site).then(
      async (relais) => {
        await relais.fermer()
        return true
      },
      () => false,
    )
    expect(accepte).toBe(false)
  },
)

test.runIf(process.platform === 'linux')(
  'le relais conserve CSP, redirection et corps sans devenir un proxy libre',
  async () => {
    const appels: string[] = []
    const autre = createServer((_entree, sortie) => sortie.end('interdit'))
    autre.listen(0, '127.0.0.1')
    await once(autre, 'listening')
    const adresseAutre = autre.address()
    if (!adresseAutre || typeof adresseAutre === 'string')
      throw new Error('Adresse de fixture absente')
    const amont = createServer(async (entree, sortie) => {
      let corps = ''
      for await (const bloc of entree) corps += bloc
      appels.push(`${entree.method} ${entree.url} ${corps}`)
      sortie.writeHead(307, {
        location: '/suivant',
        'content-security-policy': "default-src 'none'; upgrade-insecure-requests",
      })
      sortie.end('fixture')
    })
    amont.listen(0, '127.0.0.1')
    await once(amont, 'listening')
    const adresse = amont.address()
    if (!adresse || typeof adresse === 'string') throw new Error('Adresse de fixture absente')
    const relais = await ouvrirRelaisLocal(`http://127.0.0.1:${adresse.port}`)
    const envoyer = (path: string) =>
      new Promise<{ statut?: number; csp?: string | string[]; location?: string; corps: string }>(
        (resolve, reject) => {
          // Exception TLS limitee au certificat ephemere de la fixture boucle locale.
          const req = request(
            relais.site,
            { path, method: 'POST', rejectUnauthorized: false, agent: false },
            async (res) => {
              try {
                let corps = ''
                for await (const bloc of res) corps += bloc
                resolve({
                  statut: res.statusCode,
                  csp: res.headers['content-security-policy'],
                  location: res.headers.location,
                  corps,
                })
              } catch (erreur) {
                reject(erreur)
              }
            },
          )
          req.on('error', reject)
          req.end('fictif')
        },
      )
    try {
      expect(await envoyer('/formulaire?test=1')).toEqual({
        statut: 307,
        csp: "default-src 'none'; upgrade-insecure-requests",
        location: '/suivant',
        corps: 'fixture',
      })
      // Le port alternatif est local : aucun acces externe, meme pendant le sabotage.
      expect((await envoyer(`http://127.0.0.1:${adresseAutre.port}/interdit`)).statut).toBe(400)
      expect(appels).toEqual(['POST /formulaire?test=1 fictif'])
    } finally {
      await relais.fermer()
      amont.closeAllConnections()
      await new Promise<void>((resolve) => amont.close(() => resolve()))
      autre.closeAllConnections()
      await new Promise<void>((resolve) => autre.close(() => resolve()))
    }
  },
)
