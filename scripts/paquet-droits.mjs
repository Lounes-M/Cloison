import { createHash } from 'node:crypto'
import { z } from 'zod'
import { sceller, ouvrir } from '../lib/coffre/enveloppe.ts'

const MAX_FICHIER = 20 * 1024 * 1024
const MAX_TOTAL = 64 * 1024 * 1024
const MAX_ARCHIVE = 90 * 1024 * 1024
const empreinte = (octets) => createHash('sha256').update(octets).digest('hex')
const sha256 = z.string().regex(/^[a-f0-9]{64}$/)
const fichier = z.strictObject({
  nom: z.string().regex(/^(donnees|piece)-[0-9]{4}\.(json|pdf|png|jpg|txt)$/),
  taille: z.number().int().min(0).max(MAX_FICHIER),
  sha256,
})
const schema = z.strictObject({
  version: z.literal(1),
  demande: z.uuid(),
  revision: z.uuid(),
  decisionSha256: sha256,
  destinataireSha256: sha256,
  creeLe: z.iso.datetime(),
  expireLe: z.iso.datetime(),
  exclusions: z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/)).max(100),
  fichiers: z.array(fichier).min(1).max(100),
})
const refuser = () => {
  throw new Error('Paquet de droits refuse.')
}

/** Les empreintes renvoient a une decision et une identite deja verifiees hors outil. */
export function verifierDecisionPaquet(valeur, maintenant = Date.now()) {
  const p = schema.safeParse(valeur)
  if (!p.success || !Number.isSafeInteger(maintenant)) refuser()
  const d = p.data
  if (
    Date.parse(d.creeLe) > maintenant ||
    Date.parse(d.expireLe) <= maintenant ||
    new Set(d.fichiers.map((f) => f.nom)).size !== d.fichiers.length ||
    new Set(d.exclusions).size !== d.exclusions.length ||
    d.fichiers.reduce((total, f) => total + f.taille, 0) > MAX_TOTAL
  )
    refuser()
  return d
}

function verifierCle(cle) {
  if (!Buffer.isBuffer(cle) || cle.length !== 32) refuser()
}

function verifierContenu(decision, fichiers) {
  if (!(fichiers instanceof Map) || fichiers.size !== decision.fichiers.length) refuser()
  for (const f of decision.fichiers) {
    const contenu = fichiers.get(f.nom)
    if (!Buffer.isBuffer(contenu) || contenu.length !== f.taille || empreinte(contenu) !== f.sha256)
      refuser()
  }
}

/** Assemble seulement les fichiers deja relus ; aucune collecte SQL, Auth ou Storage. */
export function creerPaquetDroits(valeur, fichiers, cle, maintenant = Date.now()) {
  verifierCle(cle)
  const decision = verifierDecisionPaquet(valeur, maintenant)
  verifierContenu(decision, fichiers)
  const clair = Buffer.from(
    JSON.stringify({
      format: 'cloison.droits-personnels.v1',
      decision,
      contenus: decision.fichiers.map((f) => fichiers.get(f.nom).toString('base64')),
    }),
  )
  try {
    return sceller(clair, cle)
  } finally {
    clair.fill(0)
  }
}

/** La decision attendue doit venir du suivi courant, jamais etre acceptee depuis le paquet. */
export function ouvrirPaquetDroits(archive, cle, attendue, maintenant = Date.now()) {
  verifierCle(cle)
  const decision = verifierDecisionPaquet(attendue, maintenant)
  if (!Buffer.isBuffer(archive) || archive.length > MAX_ARCHIVE) refuser()
  let clair
  let paquet
  try {
    clair = ouvrir(archive, cle)
    paquet = JSON.parse(clair.toString('utf8'))
  } catch {
    refuser()
  } finally {
    clair?.fill(0)
  }
  const p = z
    .strictObject({
      format: z.literal('cloison.droits-personnels.v1'),
      decision: schema,
      contenus: z.array(z.string().max(4 * Math.ceil(MAX_FICHIER / 3))).max(100),
    })
    .safeParse(paquet)
  if (
    !p.success ||
    JSON.stringify(p.data.decision) !== JSON.stringify(decision) ||
    p.data.contenus.length !== decision.fichiers.length
  )
    refuser()
  const fichiers = new Map()
  for (let i = 0; i < decision.fichiers.length; i++) {
    const f = decision.fichiers[i]
    const texte = p.data.contenus[i]
    if (texte.length !== 4 * Math.ceil(f.taille / 3)) refuser()
    const contenu = Buffer.from(texte, 'base64')
    if (contenu.toString('base64') !== texte) refuser()
    fichiers.set(f.nom, contenu)
  }
  verifierContenu(decision, fichiers)
  return { decision, fichiers }
}
