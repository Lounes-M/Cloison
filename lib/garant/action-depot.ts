'use server'

import { verifierDocument } from '@/lib/coffre/validation-document'
import { verifierContenu } from '@/lib/coffre/type-reel'
import { clientStockage } from '@/lib/acces/stockage'
import { revalidatePath } from 'next/cache'

import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { deposer, retirerPiece, type NatureDePiece } from '@/lib/coffre/depot'
import { baseSupabase } from '@/lib/coffre/depot-supabase'
import { prevenirSiLeStatutAChange, statutActuel } from '@/lib/courriels/notifications'
import { TAILLE_MAX_DEPOT, natureDepuis } from '@/lib/garant/validation'

/**
 * Le depot d'une piece par le garant, et son retrait.
 *
 * Ces deux actions sont minces a dessein : tout ce qui decide vit dans
 * `lib/coffre/depot.ts`, ou une doublure permet de l'eprouver. Ici on lit le
 * jeton, on borne la taille, on nomme la nature, et on passe la main.
 *
 * Aucune limite de debit propre : les plafonds de la migration 0006 (vingt
 * pieces, soixante megaoctets par dossier) bornent deja ce qu'un lien peut
 * deposer, et ils le font dans la base, ou l'on ne les contourne pas.
 */

export type EtatDepot =
  | { statut: 'inactif' }
  | { statut: 'depose'; nature: string }
  | { statut: 'erreur'; message: string; nature?: string }

const LIEN_EXPIRE = 'Ton lien a expire. Demande au locataire de te le renvoyer.'

async function porteurGarant() {
  const porteur = await capaciteDepuisCookies()
  return porteur && porteur.capacite.partie === 'garant' ? porteur : null
}

export async function deposerUnePiece(
  _precedent: EtatDepot,
  donnees: FormData,
): Promise<EtatDepot> {
  const nature = natureDepuis(donnees.get('nature'))
  if (!nature) return { statut: 'erreur', message: 'Nature de piece inconnue.' }

  const fichier = donnees.get('fichier')
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { statut: 'erreur', message: 'Choisis un fichier.', nature }
  }

  // La borne pratique, avant meme de lire les octets : au-dela, Vercel aurait
  // de toute facon refuse le corps de la requete, et il vaut mieux que ce
  // soit nous qui l'expliquions.
  if (fichier.size > TAILLE_MAX_DEPOT) {
    return {
      statut: 'erreur',
      message: 'Ce fichier depasse 4 Mo. Une photo moins lourde ou un PDF plus leger passera.',
      nature,
    }
  }

  const porteur = await porteurGarant()
  if (!porteur) return { statut: 'erreur', message: LIEN_EXPIRE, nature }

  try {
    const supabase = clientPorteurDeLien(porteur.jeton)
    const avant = await statutActuel(supabase, porteur.capacite.dossierId)

    const contenu = Buffer.from(await fichier.arrayBuffer())
    const format = verifierContenu(contenu)
    if (!format.accepte) return { statut: 'erreur', message: format.raison, nature }
    try {
      await verifierDocument(contenu, format.type)
    } catch {
      return {
        statut: 'erreur',
        message:
          'Ce document est invalide, protégé ou trop grand. Exporte une copie lisible de moins de 40 pages.',
        nature,
      }
    }
    const resultat = await deposer(
      baseSupabase(supabase, await clientStockage(porteur.capacite)),
      porteur.capacite.dossierId,
      nature as NatureDePiece,
      contenu,
    )

    if (!resultat.depose) return { statut: 'erreur', message: resultat.raison, nature }

    // La derniere piece peut avoir fait passer le dossier a complet : c'est la
    // base qui l'a decide, et c'est ici qu'on le dit.
    await prevenirSiLeStatutAChange(supabase, porteur.capacite.dossierId, avant)
  } catch (erreur) {
    console.error('[garant] depot impossible', erreur)
    return {
      statut: 'erreur',
      message: "Le depot n'a pas abouti. Reessaie dans un instant.",
      nature,
    }
  }

  revalidatePath('/garant')
  return { statut: 'depose', nature }
}

export type EtatRetrait = { statut: 'inactif' } | { statut: 'erreur'; message: string }

export async function retirerUnePiece(
  _precedent: EtatRetrait,
  donnees: FormData,
): Promise<EtatRetrait> {
  const pieceId = String(donnees.get('piece') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(pieceId)) return { statut: 'erreur', message: 'Piece inconnue.' }

  const porteur = await porteurGarant()
  if (!porteur) return { statut: 'erreur', message: LIEN_EXPIRE }

  try {
    const supabase = clientPorteurDeLien(porteur.jeton)
    const avant = await statutActuel(supabase, porteur.capacite.dossierId)
    const resultat = await retirerPiece(baseSupabase(supabase), pieceId)
    if (!resultat.retiree) return { statut: 'erreur', message: resultat.raison }
    await prevenirSiLeStatutAChange(supabase, porteur.capacite.dossierId, avant)
  } catch (erreur) {
    console.error('[garant] retrait impossible', erreur)
    return { statut: 'erreur', message: "Le retrait n'a pas abouti. Reessaie dans un instant." }
  }

  revalidatePath('/garant')
  return { statut: 'inactif' }
}
