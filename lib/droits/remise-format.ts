import { z } from 'zod'
export const MAX_PAQUET = 90 * 1024 * 1024
const sha = z.string().regex(/^[a-f0-9]{64}$/)
export const identifiantsRemise = z.strictObject({
  id: z.uuid(),
  jeton: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  preuve: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  confirmer: z.boolean(),
  telecharger: z.boolean().default(false),
})
export const manifesteRemise = z
  .strictObject({
    version: z.literal(1),
    demande: z.uuid(),
    revision: z.uuid(),
    decisionSha256: sha,
    destinataireSha256: sha,
    creeLe: z.iso.datetime(),
    expireLe: z.iso.datetime(),
    exclusions: z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/)).max(100),
    fichiers: z
      .array(
        z.strictObject({
          nom: z.string().regex(/^(donnees|piece)-[0-9]{4}\.(json|pdf|png|jpg|txt)$/),
          taille: z
            .number()
            .int()
            .min(0)
            .max(20 * 1024 * 1024),
          sha256: sha,
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((m, c) => {
    if (
      new Set(m.fichiers.map((f) => f.nom)).size !== m.fichiers.length ||
      m.fichiers.reduce((n, f) => n + f.taille, 0) > 64 * 1024 * 1024 ||
      new Set(m.exclusions).size !== m.exclusions.length ||
      Date.parse(m.expireLe) - Date.parse(m.creeLe) > 72 * 3600000 ||
      Date.parse(m.expireLe) <= Date.parse(m.creeLe)
    )
      c.addIssue({ code: 'custom', message: 'Manifeste invalide.' })
  })
export const reponseRemise = z.strictObject({
  id: z.uuid(),
  manifeste: manifesteRemise,
  taille: z.number().int().min(29).max(MAX_PAQUET),
  sha256: sha,
  expireLe: z.iso.datetime({ offset: true }),
  secondes: z.number().int().min(0).max(30),
  recu: z.boolean(),
})
export function base64url(octets: Uint8Array): string {
  let texte = ''
  for (let i = 0; i < octets.length; i += 24576)
    texte += btoa(String.fromCharCode(...octets.subarray(i, i + 24576)))
  return texte.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
export function lireCleRemise(texte: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(texte)) throw new Error('Cle invalide.')
  const b = Uint8Array.from(atob(texte), (c) => c.charCodeAt(0))
  if (b.length !== 32 || btoa(String.fromCharCode(...b)) !== texte) {
    b.fill(0)
    throw new Error('Cle invalide.')
  }
  return b
}
export async function preuveRemise(cle: Uint8Array<ArrayBuffer>, id: string): Promise<string> {
  if (cle.length !== 32 || !z.uuid().safeParse(id).success) throw new Error('Remise invalide.')
  const k = await crypto.subtle.importKey('raw', cle, 'HKDF', false, ['deriveBits'])
  const preuve = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new TextEncoder().encode('cloison:remise:' + id),
        info: new TextEncoder().encode('authentification:v1'),
      },
      k,
      256,
    ),
  )
  try {
    return base64url(preuve)
  } finally {
    preuve.fill(0)
  }
}
export async function sha256Navigateur(b: Uint8Array<ArrayBuffer>): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', b))
  return Array.from(h, (v) => v.toString(16).padStart(2, '0')).join('')
}
export async function ouvrirRemise(
  archive: Uint8Array<ArrayBuffer>,
  cle: Uint8Array<ArrayBuffer>,
  attendue: unknown,
): Promise<Map<string, Uint8Array<ArrayBuffer>>> {
  const m = reponseRemise.parse(attendue)
  if (
    Date.parse(m.expireLe) !== Date.parse(m.manifeste.expireLe) ||
    Date.parse(m.manifeste.creeLe) > Date.now() ||
    Date.parse(m.expireLe) <= Date.now() ||
    archive.length !== m.taille ||
    (await sha256Navigateur(archive)) !== m.sha256
  )
    throw new Error('Paquet refuse.')
  const chiffres = new Uint8Array(archive.length - 12)
  chiffres.set(archive.subarray(28))
  chiffres.set(archive.subarray(12, 28), archive.length - 28)
  let clair: Uint8Array<ArrayBuffer> | undefined
  const fichiers = new Map<string, Uint8Array<ArrayBuffer>>()
  try {
    const k = await crypto.subtle.importKey('raw', cle, 'AES-GCM', false, ['decrypt'])
    clair = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: archive.subarray(0, 12), tagLength: 128 },
        k,
        chiffres,
      ),
    )
    const p = z
      .strictObject({
        format: z.literal('cloison.droits-personnels.v1'),
        decision: manifesteRemise,
        contenus: z.array(z.string().max(4 * Math.ceil((20 * 1024 * 1024) / 3))).max(100),
      })
      .parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(clair)))
    if (
      JSON.stringify(p.decision) !== JSON.stringify(m.manifeste) ||
      p.contenus.length !== m.manifeste.fichiers.length
    )
      throw new Error()
    for (const [i, f] of m.manifeste.fichiers.entries()) {
      const s = p.contenus[i]!
      if (s.length !== 4 * Math.ceil(f.taille / 3)) throw new Error()
      const b = Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
      fichiers.set(f.nom, b)
      if (
        b.length !== f.taille ||
        base64url(b) !== s.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_') ||
        (await sha256Navigateur(b)) !== f.sha256
      )
        throw new Error()
    }
    if (Date.parse(m.expireLe) <= Date.now()) throw new Error()
    return fichiers
  } catch {
    for (const b of fichiers.values()) b.fill(0)
    throw new Error('Paquet refuse.')
  } finally {
    clair?.fill(0)
    chiffres.fill(0)
  }
}
