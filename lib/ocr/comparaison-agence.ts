import 'server-only'
import { z } from 'zod'
import { contexteAgence } from '@/lib/agences/contexte'
import { baseOuvertureSupabase } from '@/lib/coffre/ouverture-supabase'
import { filigranePour, ouvrirPiecePourLAgence } from '@/lib/coffre/ouverture'
import { comparaisonRevenus, comparerAuxPieces } from './comparaison'
import { configurationComparaisonAgence, lireRevenus } from './extraction-revenus'
import { PIECES_MAX, proposerRevenu, type DocumentLu } from './revenus'

const repondre = (statut: number, valeur: unknown = null) =>
  Response.json(valeur, { status: statut, headers: { 'Cache-Control': 'no-store' } })

const reservation = z.strictObject({
  declare_cents: z.number().int().positive().max(100_000_000),
  pieces: z.array(z.uuid()).min(1).max(PIECES_MAX),
})

/**
 * L'agence demande a comparer le revenu declare aux justificatifs du garant.
 *
 * Ordre : origine et intention explicites, activation, session rattachee,
 * puis une reservation SQL unique (droits, etat du dossier, declaration
 * presente, choix des pieces, quota, journal) avant tout dechiffrement. Chaque
 * piece passe ensuite par le chemin d'ouverture de l'agence : seule la copie
 * rasterisee et filigranee part chez le fournisseur, jamais l'original (ADR
 * 0004 et 0007). Le calcul et la comparaison sont faits ici, hors IA. Rien
 * n'est ecrit dans le dossier : ni montant lu, ni ecart, ni statut.
 */
export async function comparerRevenusPour(requete: Request, dossierId: string) {
  try {
    if (!z.uuid().safeParse(dossierId).success) return repondre(404)
    if (
      requete.headers.get('origin') !== new URL(requete.url).origin ||
      requete.headers.get('x-cloison-comparaison') !== 'revenus-explicite'
    )
      return repondre(403)
    const configuration = configurationComparaisonAgence()
    if (!configuration) return repondre(503)
    const contexte = await contexteAgence()
    if (contexte.etat !== 'rattache') return repondre(401)
    requete.signal.throwIfAborted()
    const { data, error } = await contexte.supabase.rpc('reserver_comparaison_revenus', {
      le_dossier: dossierId,
    })
    const reserve = error ? null : reservation.safeParse(data)
    if (!reserve?.success) return repondre(404)
    const { declare_cents: declareCents, pieces } = reserve.data

    const base = baseOuvertureSupabase(contexte.supabase)
    const filigrane = filigranePour(contexte.email)
    // Une rasterisation a la fois : le moteur documentaire est borne en memoire.
    const copies: (Buffer | null)[] = []
    for (const piece of pieces) {
      const ouverture = await ouvrirPiecePourLAgence(base, piece, filigrane)
      copies.push(ouverture.ouverte ? ouverture.pdf : null)
      requete.signal.throwIfAborted()
    }
    // Ne rien transmettre a un tiers si l'acces a ete retire entre-temps.
    if (!(await base.piece(pieces[0]!))) return repondre(404)
    requete.signal.throwIfAborted()
    const lectures = await Promise.allSettled(
      copies.map(async (copie): Promise<DocumentLu[]> => {
        if (!copie) throw new Error('Piece indisponible')
        return lireRevenus(copie, 'application/pdf', configuration, requete.signal)
      }),
    )
    requete.signal.throwIfAborted()
    const illisibles = lectures.filter((l) => l.status === 'rejected').length
    // Aucune piece lue : une panne, pas un constat sur le dossier.
    if (illisibles === pieces.length) return repondre(503)
    // Ne rien rendre lorsque les droits ont expire pendant la lecture.
    if (!(await base.piece(pieces[0]!))) return repondre(404)
    const lecture = proposerRevenu(
      lectures.flatMap((l) => (l.status === 'fulfilled' ? l.value : [])),
    )
    return repondre(
      200,
      comparaisonRevenus.parse({
        ...comparerAuxPieces(declareCents, lecture),
        declareCents,
        lecture,
        pieces: pieces.length,
        illisibles,
        modele: configuration.modele,
      }),
    )
  } catch {
    return repondre(503)
  }
}
