import type { NextRequest } from 'next/server'

import { comparerRevenusPour } from '@/lib/ocr/comparaison-agence'

/**
 * Comparaison du revenu declare aux justificatifs du garant, par lecture IA.
 *
 * Runtime Node : dechiffrement et rasterisation. Rien n'est ecrit dans le
 * dossier, et la reponse ne survit pas a la page.
 */
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(requete: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return comparerRevenusPour(requete, (await params).id)
}
