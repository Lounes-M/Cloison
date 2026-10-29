import 'server-only'
import { createHash } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { z } from 'zod'
import { CHAMP_SIGNATURE } from './position'
import type { EtatDemandeSignature } from './prestataire'

/**
 * Adaptateur Docage (API v2). La sandbox n'est pas une autre origine : c'est
 * une transaction marquee isTest, sans valeur juridique et non facturee.
 * Toute lecture verifie que ce marquage correspond a l'environnement local.
 */
const ORIGINE = 'https://api.docage.com'
const MAX_PDF = 20 * 1024 * 1024
const indisponible = () => new Error('Operation Docage indisponible')
const identifiant = z.uuid()

/** TransactionGlobalStatus, traduit dans le vocabulaire commun du registre. */
const ETATS: Record<string, EtatDemandeSignature> = {
  '0': 'draft',
  '1': 'approval',
  '2': 'paused',
  '3': 'ongoing',
  // Valide sans etre signe : un validateur a approuve, la signature reste due.
  '4': 'ongoing',
  '5': 'done',
  '6': 'expired',
  '7': 'declined',
  '8': 'canceled',
}
const NOMS: Record<string, string> = {
  draft: '0',
  scheduled: '1',
  waitinginformations: '2',
  active: '3',
  validated: '4',
  signed: '5',
  expired: '6',
  refused: '7',
  aborted: '8',
}
export function etatDocage(valeur: unknown): EtatDemandeSignature | null {
  const cle =
    typeof valeur === 'number'
      ? String(valeur)
      : typeof valeur === 'string'
        ? (NOMS[valeur.toLowerCase()] ?? valeur)
        : ''
  return Object.hasOwn(ETATS, cle) ? (ETATS[cle] ?? null) : null
}

/** Les reponses .NET peuvent varier la casse de la premiere lettre des cles. */
function normaliser(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.map(normaliser)
  if (valeur && typeof valeur === 'object')
    return Object.fromEntries(
      Object.entries(valeur).map(([k, v]) => [
        k.charAt(0).toLowerCase() + k.slice(1),
        normaliser(v),
      ]),
    )
  return valeur
}

const transaction = z.object({
  id: identifiant,
  globalStatus: z.union([z.number().int(), z.string()]),
  isTest: z.boolean(),
  externalId: z.string().nullish(),
  transactionMembers: z
    .array(z.object({ id: identifiant, memberRole: z.union([z.number(), z.string()]).nullish() }))
    .nullish(),
  transactionFiles: z.array(z.object({ id: identifiant })).nullish(),
})

const creation = z.strictObject({ reference: identifiant, expiration: z.iso.date() })
const signataire = z.strictObject({
  prenom: z.string().trim().min(1).max(100),
  nom: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  telephone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  document: identifiant,
  page: z.number().int().min(1).max(1000),
  x: z.number().int().min(0).max(10000),
  y: z.number().int().min(0).max(10000),
})

/** Un PDF en base64, seul ou dans un objet JSON : seul le contenu %PDF- est retenu. */
function pdfDepuisReponse(valeur: unknown): Buffer {
  const candidats =
    typeof valeur === 'string'
      ? [valeur]
      : valeur && typeof valeur === 'object'
        ? Object.values(valeur).filter((v): v is string => typeof v === 'string')
        : []
  const base64 = candidats.find((v) => v.trimStart().startsWith('JVBERi0'))
  if (!base64 || !/^[A-Za-z0-9+/\s]+=*\s*$/.test(base64)) throw indisponible()
  const pdf = Buffer.from(base64, 'base64')
  verifierPdf(pdf)
  return pdf
}

function verifierPdf(octets: Uint8Array) {
  if (
    octets.byteLength < 8 ||
    octets.byteLength > MAX_PDF ||
    Buffer.from(octets.subarray(0, 5)).toString('ascii') !== '%PDF-'
  )
    throw indisponible()
}

/** Adaptateur serveur, sans acces aux dossiers. Meme contrat que Youtrust :
 * l'appelant reserve chaque ecriture et ne la rejoue jamais. Aucun retry ici.
 */
export function creerClientDocage(
  configuration: {
    environnement: 'sandbox' | 'production'
    courriel: string
    cleApi: string
    autoriserMutations?: boolean
  },
  transport: typeof fetch = fetch,
  budget?: AbortSignal,
) {
  const config = z
    .strictObject({
      environnement: z.enum(['sandbox', 'production']),
      courriel: z.email().max(254),
      cleApi: z
        .string()
        .min(1)
        .max(1024)
        .regex(/^[!-~]+$/),
      autoriserMutations: z.boolean().default(false),
    })
    .safeParse(configuration)
  if (!config.success) throw indisponible()
  const { environnement, courriel, cleApi, autoriserMutations } = config.data
  const test = environnement === 'sandbox'
  const autorisation = `Basic ${Buffer.from(`${courriel}:${cleApi}`).toString('base64')}`

  async function proteger<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action()
    } catch {
      throw indisponible()
    }
  }

  async function requete(
    chemin: string,
    options: { corps?: BodyInit; json?: boolean; post?: boolean; signal?: AbortSignal } = {},
  ): Promise<unknown> {
    if (options.post && !autoriserMutations) throw indisponible()
    const signal = AbortSignal.any([
      AbortSignal.timeout(20000),
      ...(options.signal ? [options.signal] : []),
      ...(budget ? [budget] : []),
    ])
    signal.throwIfAborted()
    const headers: Record<string, string> = {
      Authorization: autorisation,
      Accept: 'application/json',
    }
    if (options.json) headers['Content-Type'] = 'application/json'
    const reponse = await transport(`${ORIGINE}${chemin}`, {
      method: options.post ? 'POST' : 'GET',
      headers,
      body: options.corps,
      redirect: 'error',
      cache: 'no-store',
      signal,
    })
    // Un PDF base64 pese un tiers de plus que le PDF lui-meme.
    const limite = Math.ceil((MAX_PDF * 4) / 3) + 1024
    const longueur = reponse.headers.get('content-length')
    const type = reponse.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
    if (
      reponse.status !== 200 ||
      reponse.redirected ||
      !reponse.body ||
      (type !== 'application/json' && type !== 'text/plain') ||
      (longueur !== null && (!/^\d+$/.test(longueur) || Number(longueur) > limite))
    ) {
      void reponse.body?.cancel().catch(() => {})
      throw indisponible()
    }
    const lecteur = reponse.body.getReader()
    const blocs: Uint8Array[] = []
    let taille = 0
    try {
      for (;;) {
        const { value, done } = await lecteur.read()
        signal.throwIfAborted()
        if (done) break
        blocs.push(value)
        taille += value.byteLength
        if (taille > limite) throw indisponible()
      }
      if (!taille) throw indisponible()
      const texte = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(blocs, taille))
      try {
        return normaliser(JSON.parse(texte))
      } catch {
        // Certains points d'entree rendent un GUID nu.
        return texte.trim()
      }
    } finally {
      for (const bloc of blocs) bloc.fill(0)
      void lecteur.cancel().catch(() => {})
      lecteur.releaseLock()
    }
  }
  const json = (chemin: string, corps: unknown) =>
    requete(chemin, { post: true, json: true, corps: JSON.stringify(corps) })
  const guid = (valeur: unknown) => identifiant.parse(valeur)

  async function lire(id: string, signal?: AbortSignal) {
    const t = transaction.parse(
      await requete(`/Transactions/ById/${identifiant.parse(id)}`, { signal }),
    )
    const status = etatDocage(t.globalStatus)
    if (t.id !== id || t.isTest !== test || !status) throw indisponible()
    return { ...t, status }
  }

  async function hauteurPage(document: string, page: number) {
    const pdf = pdfDepuisReponse(await requete(`/TransactionFiles/DownloadDocument/${document}`))
    try {
      const doc = await PDFDocument.load(pdf, { updateMetadata: false })
      const cible = doc.getPages()[page - 1]
      if (!cible) throw indisponible()
      const { width, height } = cible.getSize()
      return { largeur: width, hauteur: height }
    } finally {
      pdf.fill(0)
    }
  }

  return {
    lire: (id: string) =>
      proteger(async () => (({ id, status }) => ({ id, status }))(await lire(id))),
    lirePourRapprochement: (id: string, signal?: AbortSignal) =>
      proteger(async () => {
        const t = await lire(id, signal)
        return { id: t.id, external_id: identifiant.parse(t.externalId), status: t.status }
      }),
    creer: (entree: z.infer<typeof creation>) =>
      proteger(async () => {
        const p = creation.parse(entree)
        const jours = Math.ceil((Date.parse(`${p.expiration}T00:00:00Z`) - Date.now()) / 86400000)
        if (jours < 1 || jours > 30) throw indisponible()
        const id = guid(
          await json('/Transactions', {
            externalId: p.reference,
            isTest: test,
            daysBeforeEnding: jours,
          }),
        )
        return { id, status: 'draft' as const }
      }),
    ajouterDocument: (id: string, pdf: Uint8Array) =>
      proteger(async () => {
        identifiant.parse(id)
        verifierPdf(pdf)
        const copie = new Uint8Array(pdf)
        const formulaire = new FormData()
        formulaire.set('TransactionId', id)
        formulaire.set('FileName', 'acte-de-cautionnement.pdf')
        formulaire.set('FriendlyName', 'acte')
        formulaire.set('Type', '0')
        formulaire.set(
          'FileToUpload',
          new Blob([copie], { type: 'application/pdf' }),
          'acte-de-cautionnement.pdf',
        )
        const document = guid(await requete('/TransactionFiles', { post: true, corps: formulaire }))
        return { id: document, sha256: createHash('sha256').update(copie).digest('hex') }
      }),
    /** Signataire en OTP SMS, puis son champ. Docage compte y depuis le bas de la page. */
    ajouterSignataire: (id: string, entree: z.infer<typeof signataire>) =>
      proteger(async () => {
        identifiant.parse(id)
        const p = signataire.parse(entree)
        const page = await hauteurPage(p.document, p.page)
        const { largeur, hauteur } = CHAMP_SIGNATURE
        if (p.x + largeur > page.largeur || p.y + hauteur > page.hauteur) throw indisponible()
        const membre = guid(
          await json('/TransactionMembers', {
            transactionId: id,
            firstName: p.prenom,
            lastName: p.nom,
            email: p.email,
            mobile: p.telephone,
            friendlyName: 'garant',
            memberRole: 0,
            signMode: 0,
          }),
        )
        const bas = Math.round(page.hauteur - p.y - hauteur)
        guid(
          await json('/TransactionMemberSignatureLocations', {
            transactionMemberId: membre,
            transactionFileId: p.document,
            coordinates: `${p.x},${bas},${largeur},${hauteur}`,
            pages: String(p.page),
          }),
        )
        return { id: membre }
      }),
    activer: (id: string) =>
      proteger(async () => {
        await requete(`/Transactions/LaunchTransaction/${identifiant.parse(id)}`, { post: true })
        const t = await lire(id)
        if (t.status !== 'ongoing' && t.status !== 'approval') throw indisponible()
        return { id: t.id, status: t.status }
      }),
    /** Les PDF restent en memoire ; Docage rend une seule preuve pour la transaction. */
    recupererPieces: (
      id: string,
      document: string,
      signataires: string[],
      signalAppelant?: AbortSignal,
    ) =>
      proteger(async () => {
        const delai = AbortSignal.timeout(45000)
        const signal = signalAppelant ? AbortSignal.any([signalAppelant, delai]) : delai
        identifiant.parse(document)
        const attendus = z.array(identifiant).min(1).max(10).parse(signataires)
        if (new Set(attendus).size !== attendus.length) throw indisponible()
        const t = await lire(id, signal)
        const membres = t.transactionMembers ?? []
        if (
          t.status !== 'done' ||
          !(t.transactionFiles ?? []).some((f) => f.id === document) ||
          !attendus.every((s) => membres.some((m) => m.id === s))
        )
          throw indisponible()
        const recus: Buffer[] = []
        let complet = false
        try {
          const telecharger = async (chemin: string) => {
            signal.throwIfAborted()
            const pdf = pdfDepuisReponse(await requete(chemin, { signal }))
            recus.push(pdf)
            return { pdf, sha256: createHash('sha256').update(pdf).digest('hex') }
          }
          const acte = await telecharger(`/TransactionFiles/DownloadDocument/${document}`)
          const preuve = await telecharger(`/Transactions/DownloadProofFile/${id}/PDF`)
          const preuves = attendus.map((s, i) =>
            i === 0
              ? { signataire: s, ...preuve }
              : { signataire: s, pdf: Buffer.from(preuve.pdf), sha256: preuve.sha256 },
          )
          complet = true
          return { acte, preuves }
        } finally {
          if (!complet) for (const pdf of recus) pdf.fill(0)
        }
      }),
  }
}
