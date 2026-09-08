import { mkdtemp, mkdir, readFile, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'

// Rejoue le moteur uniquement avec les fichiers transportes par chaque route.
// Une execution depuis le checkout masquerait les dependances absentes du build.
const racine = process.cwd()
const document = await PDFDocument.create()
document.addPage([200, 200])
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
      const chemin = relative(racine, source).split(sep).join('/')
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
          env: {
            NODE_ENV: 'production',
            LANG: 'C.UTF-8',
            TZ: 'UTC',
            DISABLE_SYSTEM_FONTS_LOAD: '1',
          },
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
        // Une page blanche en entree : toute encre vient du filigrane.
        // Compter seulement les pages avait laisse passer une sortie sans marque.
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
        const { createCanvas } = await import('@napi-rs/canvas')
        const chargement = pdfjs.getDocument({
          data: new Uint8Array(Buffer.from(sortie.pdf, 'base64')),
        })
        try {
          const rendu = await chargement.promise
          const page = await rendu.getPage(1)
          const vue = page.getViewport({ scale: 2 })
          const toile = createCanvas(Math.ceil(vue.width), Math.ceil(vue.height))
          const ctx = toile.getContext('2d')
          await page.render({ canvas: toile, canvasContext: ctx, viewport: vue }).promise
          const pixels = ctx.getImageData(0, 0, toile.width, toile.height).data
          let marques = 0
          for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 250) marques++
          assert(marques > 200, `Filigrane absent de la trace ${route}`)
        } finally {
          await chargement.destroy()
        }
      }
    }
    console.log(`Trace documentaire executee : ${route}`)
  } finally {
    await rm(temporaire, { recursive: true, force: true })
  }
}
