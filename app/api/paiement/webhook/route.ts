import { NextResponse, type NextRequest } from 'next/server'

import { clientServeur } from '@/lib/acces/serveur'
import { lireEvenement, paiementConfirme } from '@/lib/paiement/stripe'

/**
 * Ce que Stripe nous dit, et ce qu'on en fait.
 *
 * Deux barrieres, dans cet ordre. La signature de Stripe, verifiee sur le corps
 * brut : sans elle, n'importe quel `POST` marquerait un dossier regle. Puis le
 * role `serveur`, que seule notre signature de jeton fait exister, et qui n'a
 * qu'une fonction ouverte : `marquer_dossier_paye`.
 *
 * Stripe rejoue un evenement tant qu'il ne recoit pas 200. On repond 200 des
 * qu'on a compris, meme pour un evenement qui ne nous concerne pas ; on repond
 * autre chose seulement quand on veut qu'il revienne.
 */
export const runtime = 'nodejs'

export async function POST(requete: NextRequest) {
  const corps = await requete.text()
  const evenement = lireEvenement(corps, requete.headers.get('stripe-signature'))
  if (!evenement) return new NextResponse('signature refusee', { status: 400 })

  const paiement = paiementConfirme(evenement)
  if (!paiement) return NextResponse.json({ recu: true })

  const supabase = await clientServeur()
  const { data, error } = await supabase.rpc('marquer_dossier_paye', {
    le_dossier: paiement.dossierId,
    la_reference: paiement.reference,
  })

  if (error) {
    // Une anomalie (deux references pour un dossier) ne doit pas faire
    // rejouer Stripe indefiniment : elle se lit dans les journaux.
    console.error('[paiement] marquage refuse', paiement, error)
    return NextResponse.json({ recu: true, marque: false })
  }

  return NextResponse.json({ recu: true, marque: data === true })
}
