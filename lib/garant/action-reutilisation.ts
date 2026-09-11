'use server'
import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { capaciteDepuisCookies, clientPorteurDeLien, resoudreCapacite } from '@/lib/acces/session'
import { formulaireDuDossier } from '@/lib/acces/formulaire'
import { clientStockage } from '@/lib/acces/stockage'
import { estUuidCanonique } from '@/lib/validation/uuid'
import { deposer } from '@/lib/coffre/depot'
import { baseSupabase } from '@/lib/coffre/depot-supabase'
import { verifierDocument } from '@/lib/coffre/validation-document'
import { prevenirSiLeStatutAChange, statutActuel } from '@/lib/courriels/notifications'
import { reutilisation as texte } from '@/lib/content/reutilisation'
import { natureDepuis, TAILLE_MAX_DEPOT } from './validation'
import { autoriserAnalyse } from './debit-depot'
import { jetonDuLienSource } from './lien-source'
import { lireOriginalGarant } from './original'

export type PieceReutilisable = { id: string; nature: string; date: string; taille: number }
export type EtatReutilisation =
  | { statut: 'erreur'; message: string }
  | { statut: 'liste'; pieces: PieceReutilisable[] }
  | { statut: 'copie' }
const erreur = (message: string = texte.erreur): EtatReutilisation => ({
  statut: 'erreur',
  message,
})
async function contexte(donnees: FormData) {
  const cible = await capaciteDepuisCookies()
  if (
    !cible ||
    cible.capacite.partie !== 'garant' ||
    !formulaireDuDossier(donnees, cible.capacite.dossierId)
  )
    return null
  const jeton = jetonDuLienSource(donnees.get('lien_source'))
  if (!jeton) return null
  const source = await resoudreCapacite(jeton)
  if (
    !source ||
    source.partie !== 'garant' ||
    source.dossierId === cible.capacite.dossierId ||
    !estUuidCanonique(source.dossierId) ||
    !estUuidCanonique(source.jti)
  )
    return null
  return {
    cible,
    source,
    dbSource: clientPorteurDeLien(jeton),
    dbCible: clientPorteurDeLien(cible.jeton),
  }
}
export async function listerPiecesReutilisables(donnees: FormData): Promise<EtatReutilisation> {
  try {
    const c = await contexte(donnees)
    if (!c) return erreur(texte.lienInvalide)
    const { data, error } = await c.dbSource
      .from('pieces')
      .select('id,type,depose_le,taille_octets')
      .eq('dossier_id', c.source.dossierId)
      .lte('taille_octets', TAILLE_MAX_DEPOT)
      .order('depose_le', { ascending: false })
      .limit(50)
    if (error || !Array.isArray(data)) return erreur(texte.lienInvalide)
    const pieces = data
      .filter(
        (p) =>
          estUuidCanonique(p.id) &&
          natureDepuis(p.type) &&
          Number.isSafeInteger(p.taille_octets) &&
          p.taille_octets > 0 &&
          p.taille_octets <= TAILLE_MAX_DEPOT &&
          Number.isFinite(Date.parse(p.depose_le)),
      )
      .map((p) => ({ id: p.id, nature: p.type, date: p.depose_le, taille: p.taille_octets }))
    return { statut: 'liste', pieces }
  } catch {
    return erreur(texte.lienInvalide)
  }
}
export async function copierPiece(donnees: FormData): Promise<EtatReutilisation> {
  const piece = donnees.get('piece')
  if (!estUuidCanonique(piece) || donnees.get('consentement') !== 'copie-v1')
    return erreur(texte.choix)
  try {
    const c = await contexte(donnees)
    if (!c || !(await autoriserAnalyse(c.cible.capacite.dossierId))) return erreur()
    const avant = await statutActuel(c.dbCible, c.cible.capacite.dossierId)
    if (!['ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant'].includes(avant ?? ''))
      return erreur()
    const original = await lireOriginalGarant(c.dbSource, c.source, piece, TAILLE_MAX_DEPOT)
    if (!original) return erreur()
    await verifierDocument(
      original.contenu,
      original.typeReel as 'application/pdf' | 'image/png' | 'image/jpeg',
    )
    const empreinte = createHash('sha256').update(original.contenu).digest('hex')
    const confirmer = async () => {
      const { data, error } = await c.dbCible
        .from('provenances_pieces')
        .select('piece_id,empreinte_original')
        .eq('dossier_id', c.cible.capacite.dossierId)
        .eq('source_piece_id', piece)
        .maybeSingle()
      return !error && data?.empreinte_original === empreinte && estUuidCanonique(data?.piece_id)
    }
    if (!(await confirmer())) {
      const resultat = await deposer(
        baseSupabase(
          c.dbCible,
          await clientStockage(c.cible.capacite, { source: c.source, piece, empreinte }),
        ),
        c.cible.capacite.dossierId,
        original.nature,
        original.contenu,
        original.nombre,
      )
      // Une reponse perdue ne doit pas provoquer une seconde copie silencieuse.
      if (!resultat.depose && !(await confirmer())) return erreur()
      if (!(await confirmer())) return erreur()
    }
    await prevenirSiLeStatutAChange(c.dbCible, c.cible.capacite.dossierId, avant)
    revalidatePath('/garant')
    return { statut: 'copie' }
  } catch {
    return erreur()
  }
}
