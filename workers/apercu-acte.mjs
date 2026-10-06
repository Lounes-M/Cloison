import { verifierActe } from './validation-acte.ts'
import { apercuPageActe } from './rasterisation.ts'
try {
  const blocs = []
  let taille = 0
  for await (const bloc of process.stdin) {
    taille += bloc.length
    if (taille > 6 * 1024 * 1024) throw new Error()
    blocs.push(bloc)
  }
  const demande = JSON.parse(Buffer.concat(blocs).toString('utf8'))
  if (typeof demande.contenu !== 'string') throw new Error()
  const pdf = Buffer.from(demande.contenu, 'base64')
  if (pdf.toString('base64') !== demande.contenu) throw new Error()
  const pages = await verifierActe(pdf, { page: demande.page, x: 0, y: 0 })
  const png = await apercuPageActe(pdf, demande.page)
  process.stdout.write(JSON.stringify({ pages, png: png.toString('base64') }), () =>
    process.exit(0),
  )
} catch {
  process.stdout.write('{}', () => process.exit(0))
}
