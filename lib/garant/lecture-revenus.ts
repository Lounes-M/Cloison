import 'server-only'
import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { configurationLectureGarant, lireRevenus } from '@/lib/ocr/extraction-revenus'
import {
  NATURES_LISIBLES,
  PIECES_MAX,
  proposerRevenu,
  restitution,
  type DocumentLu,
} from '@/lib/ocr/revenus'
import { estUuidCanonique } from '@/lib/validation/uuid'
import { lireOriginalGarant } from './original'

const repondre = (statut: number, valeur: unknown = null) =>
  Response.json(valeur, { status: statut, headers: { 'Cache-Control': 'no-store' } })

/**
 * Le garant demande qu'une IA lise ses bulletins et sa pension.
 *
 * Ordre : origine et intention explicites, activation, capacite garant,
 * dossier de la page, puis pour chaque fichier une reservation SQL (quota et
 * journal) avant tout dechiffrement. Le fichier part tel que le garant l'a
 * depose : c'est son document, et il en a demande la lecture. La reponse ne
 * porte qu'une proposition chiffree ; aucune valeur n'est enregistree.
 */
export async function lireRevenusDuGarant(requete: Request) {
  try {
    if (
      requete.headers.get('origin') !== new URL(requete.url).origin ||
      requete.headers.get('x-cloison-lecture') !== 'revenus-explicite'
    )
      return repondre(403)
    const dossierDemande = requete.headers.get('x-cloison-dossier')
    if (!dossierDemande || !estUuidCanonique(dossierDemande)) return repondre(400)
    const configuration = configurationLectureGarant()
    if (!configuration) return repondre(503)
    const porteur = await capaciteDepuisCookies()
    if (!porteur || porteur.capacite.partie !== 'garant') return repondre(401)
    if (porteur.capacite.dossierId !== dossierDemande) return repondre(409)
    const db = clientPorteurDeLien(porteur.jeton)
    const { data: pieces, error } = await db
      .from('pieces')
      .select('id,type')
      .eq('dossier_id', porteur.capacite.dossierId)
      .in('type', [...NATURES_LISIBLES])
      .order('depose_le', { ascending: false })
      .limit(PIECES_MAX)
    if (error) return repondre(503)
    if (!pieces?.length) return repondre(404)
    requete.signal.throwIfAborted()

    // Toutes les reservations d'abord : un quota atteint n'envoie rien.
    for (const piece of pieces) {
      const { data, error: refus } = await db.rpc('reserver_lecture_ia_garant', {
        la_piece: piece.id,
      })
      if (refus || data !== true) return repondre(429)
    }
    const lectures = await Promise.allSettled(
      pieces.map(async (piece): Promise<DocumentLu[]> => {
        const original = await lireOriginalGarant(
          db,
          porteur.capacite,
          String(piece.id),
          8 * 1024 * 1024,
          false,
        )
        if (!original) throw new Error('Piece indisponible')
        requete.signal.throwIfAborted()
        return lireRevenus(original.contenu, original.typeReel, configuration, requete.signal)
      }),
    )
    requete.signal.throwIfAborted()
    const documents = lectures.flatMap((l) => (l.status === 'fulfilled' ? l.value : []))
    const illisibles = lectures.filter((l) => l.status === 'rejected').length
    if (illisibles === pieces.length) return repondre(503)
    return repondre(
      200,
      restitution.parse({
        proposition: proposerRevenu(documents),
        illisibles,
        modele: configuration.modele,
      }),
    )
  } catch {
    return repondre(503)
  }
}
