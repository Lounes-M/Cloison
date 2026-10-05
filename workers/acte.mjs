import { verifierActe } from './validation-acte.ts'
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
  await verifierActe(pdf, demande.position)
  process.stdout.write(JSON.stringify({ ok: true }), () => process.exit(0))
} catch {
  process.stdout.write(JSON.stringify({ ok: false, pages: null }), () => process.exit(0))
}
