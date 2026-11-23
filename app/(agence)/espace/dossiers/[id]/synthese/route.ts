import { NextResponse, type NextRequest } from 'next/server'

import { contexteAgence } from '@/lib/agences/contexte'
import { synthese as tEn } from '@/lib/content/en/synthese'
import { synthese as tFr } from '@/lib/content/synthese'
import { synthesePourLeBailleur } from '@/lib/dossiers/synthese-agence'
import { choisir } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'
import { estUuidCanonique } from '@/lib/validation/uuid'

/**
 * La synthese du dossier, que l'agence remet au bailleur.
 *
 * Une page : le ratio face au seuil, les pieces examinees, l'etat de l'acte.
 * Aucun justificatif, aucun montant de revenu. Filigranee au nom de la
 * personne connectee et inscrite au journal avant d'etre produite : tout cela
 * vit dans `synthesePourLeBailleur`, cette route ne fait que porter le
 * resultat.
 *
 * Runtime Node : la rasterisation en a besoin, comme pour les pieces.
 */
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(_requete: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!estUuidCanonique(id)) return new NextResponse(null, { status: 404 })

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return new NextResponse(null, { status: 401 })

  const langue = await langueEspace()
  const t = choisir(langue, tFr, tEn)
  const synthese = await synthesePourLeBailleur(contexte.supabase, id, contexte.email, langue)

  // Un refus et un dossier inexistant se lisent pareil : distinguer les deux
  // dirait ce qui existe.
  if (!synthese.ok)
    return new NextResponse(synthese.motif === 'refus' ? t.refus : t.indisponible, {
      status: synthese.motif === 'refus' ? 404 : 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })

  const nom = `${t.fichier}-${synthese.reference.replace(/[^A-Za-z0-9-]/g, '')}.pdf`
  return new NextResponse(new Uint8Array(synthese.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nom}"`,
      // Chaque exemplaire porte un nom et une date : aucun ne doit survivre
      // dans un cache intermediaire.
      'Cache-Control': 'no-store',
    },
  })
}
