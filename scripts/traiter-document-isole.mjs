import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { commandeDocker } from './commande-docker-documentaire.mjs'
import { profilConteneur } from './profil-conteneur-documentaire.mjs'
import { lireReponseDocumentaire } from '../lib/coffre/reponse-document.ts'

let actifs = 0
let nettoyageIncertain = false
const MAX_ENTREE = 30 * 1024 * 1024

/** Un conteneur neuf par document, sans service reseau ni activation Vercel. */
export async function traiterDocumentIsole(entree, image) {
  if (!Buffer.isBuffer(entree) || entree.length > MAX_ENTREE || actifs >= 2 || nettoyageIncertain)
    throw new Error('Traitement documentaire indisponible')
  let demande
  try {
    demande = JSON.parse(entree.toString('utf8'))
    if (
      !demande ||
      Object.keys(demande).sort().join(',') !== 'contenu,filigrane,operation,type' ||
      !['verifier', 'rasteriser'].includes(demande.operation) ||
      !['application/pdf', 'image/png', 'image/jpeg'].includes(demande.type) ||
      typeof demande.filigrane !== 'string' ||
      demande.filigrane.length > 320 ||
      typeof demande.contenu !== 'string' ||
      demande.contenu.length > 4 * Math.ceil((20 * 1024 * 1024) / 3)
    )
      throw new Error()
    const contenu = Buffer.from(demande.contenu, 'base64')
    if (
      !contenu.length ||
      contenu.length > 20 * 1024 * 1024 ||
      contenu.toString('base64') !== demande.contenu
    )
      throw new Error()
  } catch {
    throw new Error('Demande documentaire invalide')
  }
  const nom = 'cloison-document-' + randomUUID()
  const creation = profilConteneur(image, nom)
  actifs++
  let resultat = Buffer.alloc(0)
  let echec = null
  try {
    // Le nom est reserve avant l'appel : meme une creation de resultat incertain
    // impose une tentative de suppression, sans liberer silencieusement le slot.
    await commandeDocker(creation)
    const sortie = await commandeDocker(
      ['start', '--attach', '--interactive', nom],
      entree,
      30 * 1024 * 1024,
      20000,
    )
    resultat = lireReponseDocumentaire(sortie, demande.operation)
  } catch (erreur) {
    echec = erreur instanceof Error ? erreur : new Error('Traitement documentaire refuse')
  }
  try {
    await commandeDocker(['rm', '--force', nom])
  } catch {
    // Bloque les prochains travaux de cette instance jusqu'au diagnostic.
    nettoyageIncertain = true
    echec = new Error('Nettoyage documentaire non confirme')
  } finally {
    actifs--
  }
  if (echec) throw echec
  return resultat
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error()
    const blocs = []
    let taille = 0
    for await (const bloc of process.stdin) {
      taille += bloc.length
      if (taille > MAX_ENTREE) throw new Error()
      blocs.push(bloc)
    }
    const resultat = await traiterDocumentIsole(Buffer.concat(blocs), process.argv[2])
    // PDF binaire sur stdout pour rasteriser, sortie vide pour verifier.
    process.stdout.write(resultat)
  } catch {
    process.stderr.write('Traitement isole refuse.\n')
    process.exitCode = 1
  }
}
