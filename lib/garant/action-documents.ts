'use server'
import { revalidatePath } from 'next/cache'
import { formulaireDuDossier } from '@/lib/acces/formulaire'
import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { documentsDeclares } from '@/lib/content/garant'
import { nombreDocumentsDepuis } from './validation'
import { prevenirSiLeStatutAChange, statutActuel } from '@/lib/courriels/notifications'
export type EtatDocuments = { erreur?: string; enregistre?: boolean }
export async function declarerNombreDocuments(
  _etat: EtatDocuments,
  donnees: FormData,
): Promise<EtatDocuments> {
  const porteur = await capaciteDepuisCookies()
  const piece = donnees.get('piece')
  const nombre = nombreDocumentsDepuis('bulletin_paie', donnees.get('nombre_documents'))
  if (
    !porteur ||
    porteur.capacite.partie !== 'garant' ||
    !formulaireDuDossier(donnees, porteur.capacite.dossierId) ||
    typeof piece !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(piece) ||
    nombre === null
  )
    return { erreur: documentsDeclares.invalide }
  try {
    const db = clientPorteurDeLien(porteur.jeton)
    const avant = await statutActuel(db, porteur.capacite.dossierId)
    const { data, error } = await db.rpc('declarer_nombre_documents', {
      la_piece: piece,
      le_nombre: nombre,
    })
    if (error || data !== true) return { erreur: documentsDeclares.erreur }
    await prevenirSiLeStatutAChange(db, porteur.capacite.dossierId, avant)
    revalidatePath('/garant')
    return { enregistre: true }
  } catch {
    return { erreur: documentsDeclares.erreur }
  }
}
