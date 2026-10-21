import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { createCanvas } from '@napi-rs/canvas'
import { commandeDocker } from './commande-docker-documentaire.mjs'
import {
  ENTETE_HORODATAGE,
  ENTETE_SIGNATURE,
  signatureEgale,
  signerDemande,
  signerReponse,
} from '../lib/coffre/protocole-documentaire.ts'
import { lireReponseDocumentaire } from '../lib/coffre/reponse-document.ts'

// Bout en bout sur Linux : service HTTP, signature, vrai conteneur et arret propre.
const image = process.argv[2]
const secret = randomBytes(32).toString('hex')
const port = 18787
const base = `http://127.0.0.1:${port}`
const service = spawn(process.execPath, ['scripts/service-documentaire.mjs'], {
  env: {
    PATH: process.env.PATH ?? '',
    DOCUMENTAIRE_IMAGE: image,
    DOCUMENTAIRE_SECRET: secret,
    DOCUMENTAIRE_ECOUTE: `127.0.0.1:${port}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let journal = ''
service.stdout.on('data', (bloc) => (journal += bloc))
service.stderr.on('data', (bloc) => (journal += bloc))
const fin = new Promise((resolve) => service.on('close', (code) => resolve(code)))

try {
  const limite = Date.now() + 60_000
  for (;;) {
    const sante = await fetch(base + '/sante').catch(() => null)
    if (sante?.status === 200) break
    assert(Date.now() < limite, 'Service documentaire jamais pret')
    await new Promise((r) => setTimeout(r, 500))
  }
  assert.match(journal, /Service documentaire pret/)
  console.log('OK : service pret apres auto-test dans le conteneur')

  const envoyer = async (demande, cle = secret) => {
    const corps = Buffer.from(JSON.stringify(demande))
    const horodatage = String(Date.now())
    const signature = signerDemande(cle, horodatage, corps)
    const reponse = await fetch(base + '/v1/traiter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [ENTETE_HORODATAGE]: horodatage,
        [ENTETE_SIGNATURE]: signature,
      },
      body: corps,
    })
    const sortie = Buffer.from(await reponse.arrayBuffer())
    if (reponse.status === 200)
      assert(
        signatureEgale(
          reponse.headers.get(ENTETE_SIGNATURE),
          signerReponse(secret, signature, 200, sortie),
        ),
        'Reponse non signee',
      )
    return { statut: reponse.status, sortie }
  }

  const document = await PDFDocument.create()
  document.addPage([200, 200])
  document.addPage([200, 200])
  const pdf = Buffer.from(await document.save())
  for (const type of ['application/pdf', 'image/png', 'image/jpeg']) {
    const contenu = type === 'application/pdf' ? pdf : createCanvas(80, 80).toBuffer(type)
    const demande = { type, filigrane: 'Agence fictive', contenu: contenu.toString('base64') }
    const verification = await envoyer({ operation: 'verifier', ...demande })
    assert.equal(verification.statut, 200)
    assert.equal(lireReponseDocumentaire(verification.sortie, 'verifier').length, 0)
    const rendu = await envoyer({ operation: 'rasteriser', pagination: true, ...demande })
    assert.equal(rendu.statut, 200)
    const { pdf: produit, pages } = lireReponseDocumentaire(rendu.sortie, 'rasteriser', true)
    assert.equal(pages, type === 'application/pdf' ? 2 : 1)
    assert.equal((await PDFDocument.load(produit)).getPageCount(), pages)
  }
  console.log('OK : PDF PNG JPEG verifies et rasterises par HTTP, pagination comprise')

  const malforme = await envoyer({
    operation: 'verifier',
    type: 'application/pdf',
    filigrane: '',
    contenu: Buffer.from('%PDF-invalide').toString('base64'),
  })
  assert.equal(malforme.statut, 200)
  assert.throws(() => lireReponseDocumentaire(malforme.sortie, 'verifier'), /Document invalide/)
  const intrus = await envoyer({ operation: 'verifier' }, randomBytes(32).toString('hex'))
  assert.equal(intrus.statut, 401)
  assert.equal((await envoyer({ operation: 'verifier', secret: 'interdit' })).statut, 400)
  console.log('OK : document malforme, signature etrangere et demande invalide refuses')
} finally {
  service.kill('SIGTERM')
}
assert.equal(await fin, 0, 'Arret du service non propre')
const restants = await commandeDocker([
  'ps',
  '--all',
  '--quiet',
  '--filter',
  'label=cloison.documentaire=reference',
])
assert.equal(restants.length, 0, 'Conteneur documentaire restant')
assert.doesNotMatch(journal, /Agence fictive|%PDF/)
console.log('OK : arret propre, aucun conteneur restant ni contenu journalise')
