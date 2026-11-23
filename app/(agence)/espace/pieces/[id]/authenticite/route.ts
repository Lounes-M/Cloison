import type { NextRequest } from 'next/server'

import { verifierAvisPour } from '@/lib/2ddoc/verification-agence'

/**
 * Verification du code 2D-Doc d'un avis d'imposition.
 *
 * Runtime Node : dechiffrement, moteur documentaire et verification de
 * signature. Rien n'est rendu de la piece elle-meme.
 */
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(requete: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return verifierAvisPour(requete, (await params).id)
}
