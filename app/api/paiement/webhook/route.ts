import { NextResponse, type NextRequest } from 'next/server'

import { clientServeur } from '@/lib/acces/serveur'
import { lireEvenement, paiementConfirme } from '@/lib/paiement/stripe'
import { reponseAuMarquage } from '@/lib/paiement/webhook'

/**
 * Ce que Stripe nous dit, et ce qu'on en fait.
 *
 * Deux barrieres, dans cet ordre. La signature de Stripe, verifiee sur le corps
 * brut : sans elle, n'importe quel `POST` marquerait un dossier regle. Puis le
 * role `serveur`, que seule notre signature de jeton fait exister, et qui n'a
 * qu'une fonction ouverte pour cela : `marquer_dossier_paye`.
 *
 * Stripe rejoue un evenement tant qu'il ne recoit pas 200. On repond 200 des
 * qu'on a compris, meme pour un evenement qui ne nous concerne pas ; on repond
 * 503 seulement quand on veut qu'il revienne, c'est-a-dire quand l'echec est
 * le notre et passager. Le partage est dans `lib/paiement/webhook.ts`.
 */
export const runtime = 'nodejs'

export async function POST(requete: NextRequest) {
  try {
    const corps = await requete.text()
    const evenement = lireEvenement(corps, requete.headers.get('stripe-signature'))
    if (!evenement) return new NextResponse('signature refusee', { status: 400 })

    const paiement = paiementConfirme(evenement)
    if (!paiement) return NextResponse.json({ recu: true })

    const supabase = await clientServeur()
    const resultat = await supabase.rpc('marquer_dossier_paye', {
      le_dossier: paiement.dossierId,
      la_reference: paiement.reference,
    })

    const reponse = reponseAuMarquage(resultat)
    if (resultat.error) {
      // Les details SQL peuvent contenir des valeurs privees du paiement.
      console.error(
        reponse.statut === 200 ? '[paiement] marquage refuse' : '[paiement] marquage a rejouer',
      )
    }

    return NextResponse.json(reponse.corps, { status: reponse.statut })
  } catch {
    // Une exception de transport ou de configuration doit rester rejouable,
    // sans laisser le framework journaliser une erreur potentiellement privee.
    console.error('[paiement] webhook a rejouer')
    return NextResponse.json({ recu: false }, { status: 503 })
  }
}
