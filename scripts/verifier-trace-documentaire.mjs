import { mkdtemp, mkdir, readFile, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'

// Rejoue le moteur uniquement avec les fichiers transportes par chaque route.
// Une execution depuis le checkout masquerait les dependances absentes du build.
const racine = process.cwd()
const document = await PDFDocument.create()
document.addPage([200, 200]).drawText('Controle de livraison', { x: 10, y: 100, size: 10 })
const contenu = Buffer.from(await document.save()).toString('base64')
for (const route of [
  '(agence)/espace/pieces/[id]/route.js.nft.json',
  '(porteur)/garant/page.js.nft.json',
]) {
  const trace = join(racine, '.next/server/app', route)
  const fichiers = JSON.parse(await readFile(trace, 'utf8')).files
  const temporaire = await mkdtemp(join(tmpdir(), 'cloison-trace-'))
  try {
    let moteurPresent = false
    for (const fichier of fichiers) {
      const source = resolve(dirname(trace), fichier)
      const chemin = relative(racine, source)
      if (
        !/^(workers\/|node_modules\/(pdfjs-dist|pdf-lib|@pdf-lib|pako|tslib|@napi-rs)\/)/.test(
          chemin,
        )
      )
        continue
      if (chemin === 'workers/document.mjs') moteurPresent = true
      const destination = join(temporaire, chemin)
      await mkdir(dirname(destination), { recursive: true })
      await copyFile(source, destination)
    }
    assert(moteurPresent, `Moteur absent de la trace ${route}`)
    for (const operation of ['verifier', 'rasteriser']) {
      const resultat = spawnSync(
        process.execPath,
        ['--max-old-space-size=128', 'workers/document.mjs'],
        {
          cwd: temporaire,
          env: { NODE_ENV: 'production', LANG: 'C.UTF-8', TZ: 'UTC' },
          input: JSON.stringify({
            operation,
            type: 'application/pdf',
            filigrane: 'Agence de test',
            contenu,
          }),
          encoding: 'utf8',
          timeout: 20_000,
          maxBuffer: 2 * 1024 * 1024,
        },
      )
      assert.equal(resultat.status, 0, `Moteur inaccessible dans ${route}: ${resultat.stderr}`)
      const sortie = JSON.parse(resultat.stdout)
      assert.equal(sortie.ok, true, `Document refuse dans ${route}`)
      if (operation === 'rasteriser') {
        const pdf = await PDFDocument.load(Buffer.from(sortie.pdf, 'base64'))
        assert.equal(pdf.getPageCount(), 1)
      }
    }
    console.log(`Trace documentaire executee : ${route}`)
  } finally {
    await rm(temporaire, { recursive: true, force: true })
  }
}
