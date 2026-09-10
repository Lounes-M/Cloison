import assert from 'node:assert/strict'
import { createServer } from 'node:https'
import { request } from 'node:http'
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'

// WebKit applique upgrade-insecure-requests meme sur la boucle locale Linux.
// Garder la vraie CSP : seul le certificat ephemere de ce relais est fictif.
export async function ouvrirRelaisLocal(site) {
  const origine = new URL(site)
  assert(origine.protocol === 'http:' && origine.hostname === '127.0.0.1')
  const repertoire = await mkdtemp(join(tmpdir(), 'cloison-https-'))
  const cle = join(repertoire, 'cle.pem'),
    certificat = join(repertoire, 'certificat.pem')
  let serveur
  async function fermer() {
    if (serveur?.listening) {
      serveur.closeAllConnections()
      await new Promise((resolve) => serveur.close(resolve))
    }
    await rm(cle, { force: true })
    await rm(certificat, { force: true })
    await rmdir(repertoire)
  }
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        cle,
        '-out',
        certificat,
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=IP:127.0.0.1,DNS:localhost',
      ],
      { stdio: 'ignore', timeout: 15000, windowsHide: true },
    )
    serveur = createServer(
      { key: await readFile(cle), cert: await readFile(certificat) },
      (entree, sortie) => {
        const cible = new URL(entree.url, origine)
        if (cible.origin !== origine.origin) {
          sortie.writeHead(400).end()
          return
        }
        const amont = request(
          cible,
          {
            method: entree.method,
            headers: entree.headers,
            agent: false,
          },
          (reponse) => {
            sortie.writeHead(reponse.statusCode, reponse.headers)
            reponse.on('error', () => sortie.destroy())
            reponse.pipe(sortie)
          },
        )
        amont.setTimeout(10000, () => amont.destroy())
        amont.on('error', () => sortie.destroy())
        sortie.on('close', () => amont.destroy())
        entree.on('error', () => amont.destroy())
        entree.pipe(amont)
      },
    )
    serveur.listen(0, '127.0.0.1')
    await once(serveur, 'listening')
    return { site: `https://127.0.0.1:${serveur.address().port}`, fermer }
  } catch (erreur) {
    await fermer()
    throw erreur
  }
}
