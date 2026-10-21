import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { commandeDocker } from './commande-docker-documentaire.mjs'
import { etatTraitementIsole, traiterDocumentIsoleBrut } from './traiter-document-isole.mjs'
import {
  DEMANDE_MAX,
  ENTETE_HORODATAGE,
  ENTETE_SIGNATURE,
  FENETRE_HORODATAGE,
  SECRET_MIN,
  horodatageRecent,
  signatureEgale,
  signerDemande,
  signerReponse,
} from '../lib/coffre/protocole-documentaire.ts'

/** Meme plafond que le lanceur : un slot reste pris jusqu'a la suppression du conteneur. */
const SLOTS = 2
const ATTENTE_MAX = 8
const ATTENTE_DELAI = 5000
const REJEU_MAX = 10_000
const ARRET_DELAI = 30_000
// PNG 1x1 fictif : l'auto-test passe par le vrai conteneur et ses refus de confinement.
const PNG_TEST =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const IMAGE = /^sha256:[a-f0-9]{64}$/

/**
 * Service HTTP du moteur confine, reserve a l'application.
 *
 * Il ecoute uniquement en boucle locale derriere un proxy TLS de la meme
 * machine. Chaque demande est signee par l'application ; le document part
 * sur stdin d'un conteneur neuf et la reponse JSON du moteur revient, signee
 * et liee a sa demande. Aucun document, nom de fichier ni secret n'est
 * journalise ou ecrit sur disque par ce processus.
 */
export function creerServiceDocumentaire({
  secret,
  image,
  traiter = traiterDocumentIsoleBrut,
  etat = etatTraitementIsole,
  sonderImage = async () =>
    (await commandeDocker(['image', 'inspect', '--format', '{{.Id}}', image]))
      .toString('utf8')
      .trim() === image,
  journal = (message) => console.log(message),
  maintenant = Date.now,
}) {
  if (typeof secret !== 'string' || secret.length < SECRET_MIN)
    throw new Error('Secret documentaire invalide')
  if (typeof image !== 'string' || !IMAGE.test(image))
    throw new Error('Image documentaire invalide')

  let enCours = 0
  let pret = false
  let dernierEtat = null
  const attentes = []
  const vues = new Map()

  const liberer = () => {
    enCours--
    const suivante = attentes.shift()
    if (suivante) {
      enCours++
      clearTimeout(suivante.minuteur)
      suivante.resoudre(true)
    }
  }
  const reserver = () => {
    if (enCours < SLOTS) {
      enCours++
      return Promise.resolve(true)
    }
    if (attentes.length >= ATTENTE_MAX) return Promise.resolve(false)
    return new Promise((resoudre) => {
      const attente = { resoudre }
      attente.minuteur = setTimeout(() => {
        attentes.splice(attentes.indexOf(attente), 1)
        resoudre(false)
      }, ATTENTE_DELAI)
      attentes.push(attente)
    })
  }

  // Une demande signee n'est acceptee qu'une fois dans sa fenetre de validite.
  const premiereFois = (signature) => {
    const instant = maintenant()
    for (const [vue, expiration] of vues) if (expiration < instant) vues.delete(vue)
    if (vues.has(signature) || vues.size >= REJEU_MAX) return false
    vues.set(signature, instant + 2 * FENETRE_HORODATAGE)
    return true
  }

  const disponible = () => pret && !etat().bloque

  const repondre = (reponse, statut, corps, entetes = {}) => {
    reponse.writeHead(statut, {
      'Content-Type': 'application/json',
      'Content-Length': corps.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...entetes,
    })
    reponse.end(corps)
  }
  const refuser = (reponse, statut, entetes) =>
    repondre(reponse, statut, Buffer.from(JSON.stringify({ erreur: statut })), {
      Connection: 'close',
      ...entetes,
    })

  async function lireCorps(requete) {
    const blocs = []
    let taille = 0
    for await (const bloc of requete) {
      taille += bloc.length
      if (taille > DEMANDE_MAX) return null
      blocs.push(bloc)
    }
    return Buffer.concat(blocs, taille)
  }

  async function traiterRequete(requete, reponse) {
    const chemin = requete.url
    if (requete.method === 'GET' && chemin === '/vivant')
      return repondre(reponse, 200, Buffer.from('{"etat":"vivant"}'))
    if (requete.method === 'GET' && chemin === '/sante') {
      const { bloque } = etat()
      const libelle = bloque ? 'bloque' : pret ? 'pret' : 'indisponible'
      return repondre(
        reponse,
        libelle === 'pret' ? 200 : 503,
        Buffer.from(JSON.stringify({ etat: libelle })),
      )
    }
    if (chemin !== '/v1/traiter') return refuser(reponse, 404)
    if (requete.method !== 'POST') return refuser(reponse, 405, { Allow: 'POST' })

    const horodatage = requete.headers[ENTETE_HORODATAGE]
    const signature = requete.headers[ENTETE_SIGNATURE]
    const longueur = Number(requete.headers['content-length'])
    if (
      !horodatageRecent(horodatage, maintenant()) ||
      typeof signature !== 'string' ||
      requete.headers['content-type'] !== 'application/json'
    )
      return refuser(reponse, 401)
    if (!Number.isSafeInteger(longueur) || longueur <= 0 || longueur > DEMANDE_MAX)
      return refuser(reponse, 413)
    const corps = await lireCorps(requete)
    if (!corps || corps.length !== longueur) return refuser(reponse, 413)
    if (!signatureEgale(signature, signerDemande(secret, horodatage, corps)))
      return refuser(reponse, 401)
    if (!premiereFois(signature)) return refuser(reponse, 409)
    if (!disponible()) return refuser(reponse, 503, { 'Retry-After': '30' })
    if (!(await reserver())) return refuser(reponse, 503, { 'Retry-After': '2' })
    let sortie
    try {
      sortie = await traiter(corps, image)
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : ''
      if (message === 'Demande documentaire invalide') return refuser(reponse, 400)
      if (etat().bloque) {
        journal('Service documentaire bloque : nettoyage de conteneur non confirme')
        return refuser(reponse, 503, { 'Retry-After': '30' })
      }
      // Arret interne, memoire, sortie excessive ou panne du daemon : sans detail.
      return refuser(reponse, 502)
    } finally {
      liberer()
    }
    repondre(reponse, 200, sortie, {
      [ENTETE_SIGNATURE]: signerReponse(secret, signature, 200, sortie),
    })
  }

  const serveur = createServer((requete, reponse) => {
    traiterRequete(requete, reponse).catch(() => {
      if (!reponse.headersSent) refuser(reponse, 500)
      else reponse.destroy()
    })
  })
  serveur.requestTimeout = 30_000
  serveur.headersTimeout = 10_000
  serveur.keepAliveTimeout = 5_000
  serveur.maxHeadersCount = 32

  /** Image presente et vrai traitement d'un document fictif dans le conteneur. */
  serveur.verifierDisponibilite = async () => {
    try {
      if (!(await sonderImage())) throw new Error()
      const demande = Buffer.from(
        JSON.stringify({
          operation: 'verifier',
          type: 'image/png',
          filigrane: '',
          contenu: PNG_TEST,
        }),
      )
      if (!(await reserver())) return pret
      try {
        const sortie = JSON.parse((await traiter(demande, image)).toString('utf8'))
        if (sortie.ok !== true) throw new Error()
      } finally {
        liberer()
      }
      pret = true
    } catch {
      pret = false
    }
    if (pret !== dernierEtat)
      journal(
        pret ? 'Service documentaire pret' : 'Service documentaire indisponible : auto-test refuse',
      )
    dernierEtat = pret
    return pret
  }
  serveur.attendreFin = async () => {
    const limite = Date.now() + ARRET_DELAI
    while (enCours > 0 && Date.now() < limite) await new Promise((r) => setTimeout(r, 100))
    return enCours === 0
  }
  return serveur
}

async function lireSecret() {
  const dossier = process.env.CREDENTIALS_DIRECTORY
  if (dossier) return (await readFile(join(dossier, 'documentaire-secret'), 'utf8')).trim()
  return process.env.DOCUMENTAIRE_SECRET?.trim() ?? ''
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const ecoute = process.env.DOCUMENTAIRE_ECOUTE?.trim() || '127.0.0.1:8787'
    const correspondance = /^(127\.0\.0\.1|\[::1\]):(\d{2,5})$/.exec(ecoute)
    if (!correspondance) throw new Error('Ecoute limitee a la boucle locale')
    const serveur = creerServiceDocumentaire({
      secret: await lireSecret(),
      image: process.env.DOCUMENTAIRE_IMAGE?.trim() ?? '',
    })
    serveur.listen(Number(correspondance[2]), correspondance[1].replace(/^\[|\]$/g, ''))
    await serveur.verifierDisponibilite()
    const sondes = setInterval(() => void serveur.verifierDisponibilite(), 5 * 60_000)
    const arreter = async () => {
      clearInterval(sondes)
      serveur.close()
      process.exitCode = (await serveur.attendreFin()) ? 0 : 1
      serveur.closeAllConnections()
    }
    process.once('SIGTERM', arreter)
    process.once('SIGINT', arreter)
  } catch (erreur) {
    process.stderr.write(
      `Service documentaire non demarre : ${erreur instanceof Error ? erreur.message : 'erreur'}\n`,
    )
    process.exitCode = 1
  }
}
