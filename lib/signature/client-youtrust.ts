import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { environnementYoutrust, etatYoutrust, identifiantYoutrust } from './youtrust'

const ORIGINES = {
  sandbox: 'https://api-sandbox.yousign.app/v3',
  production: 'https://api.yousign.app/v3',
} as const
const MAX_PDF = 20 * 1024 * 1024
const indisponible = () => new Error('Operation Youtrust indisponible')
const demande = z.object({ id: identifiantYoutrust, status: etatYoutrust })
const reference = z.object({ id: identifiantYoutrust })
const creation = z.strictObject({
  reference: identifiantYoutrust,
  expiration: z.iso.date(),
})
const signataire = z.strictObject({
  prenom: z.string().trim().min(1).max(100),
  nom: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  telephone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  document: identifiantYoutrust,
  page: z.number().int().min(1).max(1000),
  x: z.number().int().min(0).max(10000),
  y: z.number().int().min(0).max(10000),
})

/** Adaptateur serveur, sans acces aux dossiers. L'appelant doit verifier ses droits,
 * persister chaque ID avant l'etape suivante et rapprocher tout POST incertain.
 * Aucun retry automatique : external_id n'est PAS une cle d'idempotence.
 */
export function creerClientYoutrust(
  configuration: {
    environnement: 'sandbox' | 'production'
    cleApi: string
    autoriserMutations?: boolean
  },
  transport: typeof fetch = fetch,
) {
  const config = z
    .strictObject({
      environnement: environnementYoutrust,
      cleApi: z
        .string()
        .min(1)
        .max(1024)
        .regex(/^[!-~]+$/),
      autoriserMutations: z.boolean().default(false),
    })
    .safeParse(configuration)
  if (!config.success) throw indisponible()
  const { environnement, cleApi, autoriserMutations } = config.data

  async function proteger<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action()
    } catch {
      throw indisponible()
    }
  }

  async function requete(
    chemin: string,
    options: {
      corps?: BodyInit
      json?: boolean
      pdf?: boolean
      post?: boolean
      signal?: AbortSignal
      limite?: number
    } = {},
  ) {
    if (options.post && !autoriserMutations) throw indisponible()
    const delai = AbortSignal.timeout(15000)
    const signal = options.signal ? AbortSignal.any([options.signal, delai]) : delai
    signal.throwIfAborted()
    const headers: Record<string, string> = {
      Authorization: `Bearer ${cleApi}`,
      Accept: options.pdf ? 'application/pdf' : 'application/json',
    }
    if (options.json) headers['Content-Type'] = 'application/json'
    const reponse = await transport(`${ORIGINES[environnement]}${chemin}`, {
      method: options.post ? 'POST' : 'GET',
      headers,
      body: options.corps,
      redirect: 'error',
      cache: 'no-store',
      signal,
    })
    const limite = Math.min(options.pdf ? MAX_PDF : 1024 * 1024, options.limite ?? Infinity)
    const longueur = reponse.headers.get('content-length')
    if (
      ![200, 201].includes(reponse.status) ||
      reponse.redirected ||
      !reponse.body ||
      reponse.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
        (options.pdf ? 'application/pdf' : 'application/json') ||
      (longueur !== null && (!/^\d+$/.test(longueur) || Number(longueur) > limite))
    ) {
      void reponse.body?.cancel().catch(() => {})
      throw indisponible()
    }
    const lecteur = reponse.body.getReader()
    const annuler = () => {
      void lecteur.cancel().catch(() => {})
    }
    signal.addEventListener('abort', annuler, { once: true })
    const blocs: Uint8Array[] = []
    let taille = 0
    try {
      signal.throwIfAborted()
      for (;;) {
        const { value, done } = await lecteur.read()
        signal.throwIfAborted()
        if (done) break
        taille += value.byteLength
        if (taille > limite) throw indisponible()
        blocs.push(value)
      }
      if (!taille) throw indisponible()
      return Buffer.concat(blocs, taille)
    } finally {
      signal.removeEventListener('abort', annuler)
      annuler()
      lecteur.releaseLock()
    }
  }
  async function json(chemin: string, corps?: unknown, signal?: AbortSignal) {
    const octets = await requete(
      chemin,
      corps === undefined
        ? { signal }
        : {
            signal,
            post: true,
            json: true,
            corps: JSON.stringify(corps),
          },
    )
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(octets)) as unknown
  }
  const chemin = (id: string) => `/signature_requests/${identifiantYoutrust.parse(id)}`
  async function lire(id: string) {
    const resultat = demande.parse(await json(chemin(id)))
    if (resultat.id !== id) throw indisponible()
    return resultat
  }
  async function changer(id: string, action: 'activate' | 'cancel', corps?: unknown) {
    const resultat = demande.parse(await json(`${chemin(id)}/${action}`, corps ?? {}))
    if (
      resultat.id !== id ||
      (action === 'activate'
        ? !['ongoing', 'approval'].includes(resultat.status)
        : resultat.status !== 'canceled')
    )
      throw indisponible()
    return resultat
  }
  function verifierPdf(octets: Uint8Array) {
    if (
      octets.byteLength < 8 ||
      octets.byteLength > MAX_PDF ||
      Buffer.from(octets.subarray(0, 5)).toString('ascii') !== '%PDF-'
    )
      throw indisponible()
  }

  return {
    lire: (id: string) => proteger(() => lire(id)),
    lirePourRapprochement: (id: string) =>
      proteger(async () => {
        const resultat = demande
          .extend({ external_id: identifiantYoutrust })
          .parse(await json(chemin(id)))
        if (resultat.id !== id) throw indisponible()
        return resultat
      }),
    creer: (entree: z.infer<typeof creation>) =>
      proteger(async () => {
        const p = creation.parse(entree)
        const expiration = Date.parse(`${p.expiration}T00:00:00Z`)
        if (expiration <= Date.now() || expiration > Date.now() + 365 * 86400000)
          throw indisponible()
        const resultat = demande.parse(
          await json('/signature_requests', {
            name: 'Acte de cautionnement Cloison',
            external_id: p.reference,
            expiration_date: p.expiration,
            delivery_mode: 'email',
            timezone: 'Europe/Paris',
            audit_trail_locale: 'fr',
            signers_allowed_to_decline: true,
          }),
        )
        if (resultat.status !== 'draft') throw indisponible()
        return resultat
      }),
    ajouterDocument: (id: string, pdf: Uint8Array) =>
      proteger(async () => {
        const cible = chemin(id)
        verifierPdf(pdf)
        const copie = new Uint8Array(pdf)
        const empreinte = createHash('sha256').update(copie).digest('hex')
        const formulaire = new FormData()
        formulaire.set('nature', 'signable_document')
        formulaire.set('file', new Blob([copie], { type: 'application/pdf' }), 'acte.pdf')
        const octets = await requete(`${cible}/documents`, { post: true, corps: formulaire })
        const resultat = z
          .object({
            id: identifiantYoutrust,
            sha256: z.literal(empreinte),
            nature: z.literal('signable_document'),
            content_type: z.literal('application/pdf'),
            is_protected: z.literal(false),
            is_signed: z.literal(false),
          })
          .parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(octets)))
        return { id: resultat.id, sha256: resultat.sha256 }
      }),
    ajouterSignataire: (id: string, entree: z.infer<typeof signataire>) =>
      proteger(async () => {
        const cible = chemin(id)
        const p = signataire.parse(entree)
        const resultat = z
          .object({
            id: identifiantYoutrust,
            signature_level: z.literal('advanced_electronic_signature'),
            signature_authentication_mode: z.literal('otp_sms'),
          })
          .parse(
            await json(`${cible}/signers`, {
              info: {
                first_name: p.prenom,
                last_name: p.nom,
                email: p.email,
                phone_number: p.telephone,
                locale: 'fr',
              },
              signature_level: 'advanced_electronic_signature',
              signature_authentication_mode: 'otp_sms',
              fields: [
                { type: 'signature', document_id: p.document, page: p.page, x: p.x, y: p.y },
              ],
            }),
          )
        return reference.parse(resultat)
      }),
    activer: (id: string) => proteger(() => changer(id, 'activate')),
    annuler: (id: string, raison: 'contractualization_aborted' | 'errors_in_document' | 'other') =>
      proteger(async () => {
        z.enum(['contractualization_aborted', 'errors_in_document', 'other']).parse(raison)
        return changer(id, 'cancel', { reason: raison })
      }),
    /** Les PDF restent en memoire. Leur presence et leur empreinte ne valident pas
     * cryptographiquement la signature et ne constituent pas un archivage probant. */
    recupererPieces: (
      id: string,
      document: string,
      signataires: string[],
      signalAppelant?: AbortSignal,
    ) =>
      proteger(async () => {
        const delai = AbortSignal.timeout(45000)
        const signal = signalAppelant ? AbortSignal.any([signalAppelant, delai]) : delai
        signal.throwIfAborted()
        let restant = 50 * 1024 * 1024
        const cible = chemin(id)
        identifiantYoutrust.parse(document)
        const attendus = z.array(identifiantYoutrust).min(1).max(10).parse(signataires)
        if (new Set(attendus).size !== attendus.length) throw indisponible()
        const etat = z
          .object({
            id: z.literal(id),
            status: z.literal('done'),
            documents: z.array(z.object({ id: identifiantYoutrust, nature: z.string() })),
            signers: z.array(z.object({ id: identifiantYoutrust, status: z.string() })),
          })
          .parse(await json(cible, undefined, signal))
        if (
          !etat.documents.some((d) => d.id === document && d.nature === 'signable_document') ||
          etat.signers.length !== attendus.length ||
          !attendus.every((s) => etat.signers.some((r) => r.id === s && r.status === 'signed'))
        )
          throw indisponible()
        const telecharger = async (suffixe: string) => {
          signal.throwIfAborted()
          if (restant < 8) throw indisponible()
          const pdf = await requete(`${cible}${suffixe}`, { pdf: true, signal, limite: restant })
          restant -= pdf.byteLength
          verifierPdf(pdf)
          return { pdf, sha256: createHash('sha256').update(pdf).digest('hex') }
        }
        const acte = await telecharger(`/documents/${document}/download`)
        const preuves = []
        for (const signataire of attendus) {
          preuves.push({
            signataire,
            ...(await telecharger(`/signers/${signataire}/audit_trails/download`)),
          })
        }
        return { acte, preuves }
      }),
  }
}
