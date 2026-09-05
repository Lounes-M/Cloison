import { verifierDocument } from './validation-document.ts'
import { rasteriser } from './rasterisation.ts'

try {
  let taille = 0
  const blocs = []
  for await (const bloc of process.stdin) {
    taille += bloc.length
    if (taille > 30 * 1024 * 1024) throw new Error('Entree trop volumineuse')
    blocs.push(bloc)
  }
  const demande = JSON.parse(Buffer.concat(blocs).toString('utf8'))
  if (
    !['verifier', 'rasteriser'].includes(demande.operation) ||
    !['application/pdf', 'image/png', 'image/jpeg'].includes(demande.type) ||
    typeof demande.contenu !== 'string' ||
    typeof demande.filigrane !== 'string' ||
    demande.filigrane.length > 320
  )
    throw new Error('Entree invalide')
  const contenu = Buffer.from(demande.contenu, 'base64')
  if (!contenu.length || contenu.length > 20 * 1024 * 1024) throw new Error('Taille invalide')
  let pdf
  if (demande.operation === 'verifier') await verifierDocument(contenu, demande.type)
  else {
    const sortie = await rasteriser(contenu, demande.type, demande.filigrane)
    if (sortie.length > 20 * 1024 * 1024) throw new Error('Sortie trop volumineuse')
    pdf = sortie.toString('base64')
  }
  process.stdout.write(JSON.stringify({ ok: true, pdf }), () => process.exit(0))
} catch (erreur) {
  // Les erreurs des decodeurs peuvent contenir du texte du document.
  // Seul un nombre de pages extrait d'une erreur controlee sort du processus.
  const pages = /^Ce document compte (\d+) pages/.exec(
    erreur instanceof Error ? erreur.message : '',
  )
  process.stdout.write(JSON.stringify({ ok: false, pages: pages ? Number(pages[1]) : null }), () =>
    process.exit(0),
  )
}
