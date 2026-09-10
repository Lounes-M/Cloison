import { NextResponse, type NextRequest } from 'next/server'

import { baseOuvertureSupabase } from '@/lib/coffre/ouverture-supabase'
import { filigranePour, ouvrirPiecePourLAgence } from '@/lib/coffre/ouverture'
import { contexteAgence } from '@/lib/agences/contexte'
import { lirePieceParOcr } from '@/lib/ocr/lecture-agence'

export async function POST(requete: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return lirePieceParOcr(requete, (await params).id)
}

/**
 * Une piece, telle que l'agence la recoit.
 *
 * Jamais le document d'origine : une photographie de document, filigranee au
 * nom de la personne connectee, et dont l'ouverture est inscrite au journal
 * avant qu'un seul octet soit dechiffre. Tout cela vit dans
 * `ouvrirPiecePourLAgence` ; cette route ne fait que porter le resultat.
 *
 * Runtime Node, et pas Edge : le chiffrement et la rasterisation en ont
 * besoin. Une minute de duree maximale : quarante pages a 150 points par
 * pouce tiennent largement dedans, et au-dela c'est un document qu'on refuse.
 */
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(_requete: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 404 })

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return new NextResponse(null, { status: 401 })

  const ouverture = await ouvrirPiecePourLAgence(
    baseOuvertureSupabase(contexte.supabase),
    id,
    filigranePour(contexte.email),
  )

  // Un refus d'acces et une piece inexistante se lisent pareil : distinguer
  // les deux dirait ce qui existe.
  if (!ouverture.ouverte) return new NextResponse(ouverture.raison, { status: 404 })

  // Vercel borne les reponses tamponnees a 4,5 Mo. Le flux ne commence
  // qu'apres autorisation, journalisation et rasterisation completes.
  let position = 0
  const flux = new ReadableStream<Uint8Array>({
    pull(controleur) {
      if (position >= ouverture.pdf.length) {
        controleur.close()
        return
      }
      const fin = Math.min(position + 64 * 1024, ouverture.pdf.length)
      controleur.enqueue(new Uint8Array(ouverture.pdf.subarray(position, fin)))
      position = fin
    },
  })
  return new NextResponse(flux, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="piece-${id.slice(0, 8)}.pdf"`,
      // Chaque exemplaire porte un nom et une date : aucun ne doit survivre
      // dans un cache intermediaire.
      'Cache-Control': 'no-store',
    },
  })
}
