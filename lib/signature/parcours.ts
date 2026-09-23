import 'server-only'
import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ouvrir } from '@/lib/coffre/enveloppe'
import { ouvrirMaitresse } from '@/lib/coffre/rotation-maitresse'
import type { creerClientYoutrust } from './client-youtrust'
import { contexteActe, dossierActe, type DossierActe } from './parcours-types'
import {
  empreintePdf,
  ouvrirFichierActe,
  referenceFichierActe,
  scellerFichierActe,
  type FichierActe,
} from './archive-format'
import { stockageActe } from './stockage-actes'

export type BaseActes = Pick<SupabaseClient, 'rpc'>
type Stockage = typeof stockageActe
type Fournisseur = ReturnType<typeof creerClientYoutrust>
const bytea = (b: Buffer) => `\\x${b.toString('hex')}`
export function ouvrirContexteActe(dossier: DossierActe) {
  const cle = ouvrirMaitresse(Buffer.from(dossier.acte.cle_scellee.slice(2), 'hex'))
  try {
    if (cle.length !== 32) throw new Error('Acte indisponible')
    const contexte = contexteActe.parse(
      JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          ouvrir(Buffer.from(dossier.acte.contexte_chiffre.slice(2), 'hex'), cle),
        ),
      ),
    )
    if (
      contexte.id !== dossier.acte.id ||
      dossier.demande.id !== dossier.acte.id ||
      (dossier.demande.source_dossier && contexte.dossier !== dossier.demande.source_dossier)
    )
      throw new Error('Acte indisponible')
    return { cle, contexte }
  } catch (erreur) {
    cle.fill(0)
    throw erreur
  }
}
export async function chargerActe(db: BaseActes, id: string) {
  const r = await db.rpc('charger_acte_signature', { le_id: id })
  if (r.error) throw new Error('Acte indisponible')
  const d = dossierActe.parse(r.data)
  if (d.acte.id !== id) throw new Error('Acte indisponible')
  return d
}
export async function archiverFichier(
  db: BaseActes,
  id: string,
  nature: FichierActe['nature'],
  pdf: Buffer,
  cle: Buffer,
  signal: AbortSignal,
  stockage: Stockage = stockageActe,
) {
  signal.throwIfAborted()
  const r = await db.rpc('reserver_fichier_signature', {
    le_id: id,
    la_nature: nature,
    empreinte: empreintePdf(pdf),
    taille: pdf.length,
    nonce: bytea(randomBytes(12)),
  })
  if (r.error) throw new Error('Archive indisponible')
  const f = referenceFichierActe.parse(r.data)
  if (
    f.acte_id !== id ||
    f.nature !== nature ||
    f.empreinte !== empreintePdf(pdf) ||
    f.taille !== pdf.length
  )
    throw new Error('Archive incoherente')
  const acces = await stockage(f, signal)
  if (!f.confirme) await acces.deposer(scellerFichierActe(pdf, cle, f))
  // Confirmer les octets relus, y compris apres une reponse d'upload perdue.
  const relu = ouvrirFichierActe(await acces.lire(), cle, f)
  try {
    if (!relu.equals(pdf)) throw new Error('Archive incoherente')
  } finally {
    relu.fill(0)
  }
  signal.throwIfAborted()
  const confirmation = await db.rpc('confirmer_fichier_signature', { le_fichier: f.id })
  if (confirmation.error || confirmation.data !== true) throw new Error('Archive non confirmee')
  return f
}

/** Un seul acte par execution. Chaque POST est reserve durablement avant l'appel. */
export async function traiterActe(
  db: BaseActes,
  id: string,
  mode: 'sandbox' | 'production',
  fournisseur: Fournisseur,
  signal: AbortSignal,
  stockage: Stockage = stockageActe,
) {
  let d = await chargerActe(db, id)
  if (d.demande.environnement !== mode || d.demande.anomalie) throw new Error('Acte indisponible')
  if (['canceled', 'declined', 'rejected', 'deleted', 'expired'].includes(d.demande.etat)) return
  const { cle, contexte } = ouvrirContexteActe(d)
  try {
    for (let tour = 0; tour < 4; tour++) {
      signal.throwIfAborted()
      const etape = d.acte.etape
      if (!['valide', 'document', 'signataire', 'activation'].includes(etape)) break
      const reservation = await db.rpc('reserver_operation_acte', {
        le_id: id,
        etape_attendue: etape,
      })
      if (reservation.error || typeof reservation.data !== 'string')
        throw new Error('Operation non reservee')
      const bail = reservation.data
      let reference: string
      const distante = d.demande.reference_fournisseur
      if (etape === 'valide') {
        reference = (
          await fournisseur.creer({
            reference: id,
            expiration: new Date(d.acte.expire_signature).toISOString().slice(0, 10),
          })
        ).id
      } else {
        if (!distante) throw new Error('Reference absente')
        if (etape === 'document') {
          const projet = d.fichiers.find((f) => f.nature === 'projet' && f.confirme)
          if (!projet || projet.empreinte !== d.demande.empreinte_acte)
            throw new Error('Projet absent')
          const pdf = ouvrirFichierActe(await (await stockage(projet, signal)).lire(), cle, projet)
          try {
            reference = (await fournisseur.ajouterDocument(distante, pdf)).id
          } finally {
            pdf.fill(0)
          }
        } else if (etape === 'signataire') {
          if (!d.acte.document_fournisseur) throw new Error('Document absent')
          reference = (
            await fournisseur.ajouterSignataire(distante, {
              prenom: contexte.prenom,
              nom: contexte.nom,
              email: contexte.email,
              telephone: contexte.telephone,
              document: d.acte.document_fournisseur,
              page: contexte.page,
              x: contexte.x,
              y: contexte.y,
            })
          ).id
        } else reference = (await fournisseur.activer(distante)).id
      }
      signal.throwIfAborted()
      const confirmation = await db.rpc('confirmer_operation_acte', {
        le_id: id,
        le_bail: bail,
        etape_attendue: etape,
        reference,
      })
      if (confirmation.error || confirmation.data !== true) throw new Error('Operation incertaine')
      d = await chargerActe(db, id)
    }
    if (d.acte.etape !== 'en_cours' || d.demande.etat !== 'done') return
    const { reference_fournisseur: distante } = d.demande
    const { document_fournisseur: document, signataire_fournisseur: signataire } = d.acte
    if (!distante || !document || !signataire) throw new Error('References incompletes')
    const pieces = await fournisseur.recupererPieces(distante, document, [signataire], signal)
    if (pieces.preuves.length !== 1 || pieces.preuves[0]?.signataire !== signataire)
      throw new Error('Preuve absente')
    await archiverFichier(db, id, 'acte', pieces.acte.pdf, cle, signal, stockage)
    await archiverFichier(db, id, 'preuve', pieces.preuves[0].pdf, cle, signal, stockage)
    signal.throwIfAborted()
    const publication = await db.rpc('publier_archive_signature', {
      le_id: id,
      la_revision: d.demande.revision,
    })
    if (publication.error || publication.data !== true) throw new Error('Archive non publiee')
  } finally {
    cle.fill(0)
  }
}
