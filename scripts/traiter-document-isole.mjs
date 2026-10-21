import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { commandeDocker } from './commande-docker-documentaire.mjs'
import { profilConteneur } from './profil-conteneur-documentaire.mjs'
import { lireReponseDocumentaire, RefusDocumentaire } from '../lib/coffre/reponse-document.ts'

let actifs = 0
let nettoyageIncertain = false
const MAX_ENTREE = 30 * 1024 * 1024

/** Etat de cette instance, pour les sondes du service. Aucun detail de document. */
export function etatTraitementIsole() {
  return { actifs, bloque: nettoyageIncertain }
}

/** Un conteneur neuf par document, sans service reseau ni activation Vercel. */
export async function traiterDocumentIsole(entree, image) {
  const { sortie, demande } = await executerConteneur(entree, image)
  return demande.pagination
    ? lireReponseDocumentaire(sortie, 'rasteriser', true).pdf
    : lireReponseDocumentaire(sortie, demande.operation)
}

/**
 * Reponse JSON du moteur, verifiee par le lecteur strict puis rendue telle
 * quelle : un refus bien forme ({ ok: false }) est transmis a l'appelant, qui
 * le relit avec le meme lecteur que pour le processus local.
 */
export async function traiterDocumentIsoleBrut(entree, image) {
  const { sortie, demande } = await executerConteneur(entree, image)
  try {
    if (demande.pagination) lireReponseDocumentaire(sortie, 'rasteriser', true)
    else lireReponseDocumentaire(sortie, demande.operation)
  } catch (erreur) {
    if (!(erreur instanceof RefusDocumentaire)) throw erreur
  }
  return sortie
}

async function executerConteneur(entree, image) {
  if (!Buffer.isBuffer(entree) || entree.length > MAX_ENTREE || actifs >= 2 || nettoyageIncertain)
    throw new Error('Traitement documentaire indisponible')
  let demande
  try {
    demande = JSON.parse(entree.toString('utf8'))
    if (
      !demande ||
      !['contenu,filigrane,operation,type', 'contenu,filigrane,operation,pagination,type'].includes(
        Object.keys(demande).sort().join(','),
      ) ||
      !['verifier', 'rasteriser'].includes(demande.operation) ||
      (demande.pagination !== undefined &&
        (demande.pagination !== true || demande.operation !== 'rasteriser')) ||
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
  let sortie = Buffer.alloc(0)
  let echec = null
  try {
    // Le nom est reserve avant l'appel : meme une creation de resultat incertain
    // impose une tentative de suppression, sans liberer silencieusement le slot.
    await commandeDocker(creation)
    sortie = await commandeDocker(
      ['start', '--attach', '--interactive', nom],
      entree,
      30 * 1024 * 1024,
      20000,
    )
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
  return { sortie, demande }
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
