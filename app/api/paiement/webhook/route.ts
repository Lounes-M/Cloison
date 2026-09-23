import { NextResponse, type NextRequest } from 'next/server'
import { lireCorpsWebhook } from '@/lib/http/corps-webhook'
import { clientServeur } from '@/lib/acces/serveur'
import {
  lireEvenement,
  retrouverSessionFinanciere,
  traiterEvenementActe,
} from '@/lib/paiement/stripe'
import { extraireEvenementFinancier } from '@/lib/paiement/evenement-financier'
export const runtime = 'nodejs'
export const maxDuration = 25

/** La signature precede tout enregistrement. Le registre et le marquage sont atomiques. */
export async function POST(requete: NextRequest) {
  try {
    const corps = await lireCorpsWebhook(requete)
    if (corps === null) return NextResponse.json({ recu: false }, { status: 413 })
    const evenement = lireEvenement(corps, requete.headers.get('stripe-signature'))
    if (!evenement) return new NextResponse('signature refusee', { status: 400 })
    if (
      process.env.FACTURATION_ACTES_ENABLED === 'true' &&
      (await traiterEvenementActe(
        evenement,
        AbortSignal.any([requete.signal, AbortSignal.timeout(20000)]),
      ))
    )
      return NextResponse.json({ recu: true })
    // Le paiement agence ne doit jamais entrer dans le registre locataire.
    if (
      evenement.type.startsWith('checkout.session.') &&
      'metadata' in evenement.data.object &&
      evenement.data.object.metadata?.produit === 'cloison_acte'
    )
      return NextResponse.json({ recu: true })
    let financier
    try {
      financier = extraireEvenementFinancier(evenement)
    } catch {
      return NextResponse.json({ recu: false }, { status: 400 })
    }
    if (!financier) return NextResponse.json({ recu: true })
    if (financier.rpc === 'enregistrer_suivi_paiement') {
      const session = await retrouverSessionFinanciere(
        String(financier.parametres.reference_paiement),
      )
      if (!session) return NextResponse.json({ recu: true })
      Object.assign(financier.parametres, session)
    }
    const db = await clientServeur(AbortSignal.any([requete.signal, AbortSignal.timeout(5000)]))
    const { data, error } = await db.rpc(financier.rpc, financier.parametres)
    if (error) throw new Error('Registre indisponible')
    if (financier.rpc === 'enregistrer_suivi_paiement') {
      if (typeof data !== 'boolean') throw new Error('Suivi non confirme')
      return NextResponse.json(data ? { recu: true } : { recu: true, anomalie: true })
    }
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      Object.keys(data).length !== 2 ||
      typeof data.marque !== 'boolean' ||
      typeof data.anomalie !== 'boolean'
    )
      throw new Error('Paiement non confirme')
    if (data.anomalie) console.error('[paiement] registre a examiner')
    return NextResponse.json({
      recu: true,
      marque: data.marque,
      ...(data.anomalie ? { anomalie: true } : {}),
    })
  } catch {
    console.error('[paiement] webhook a rejouer')
    return NextResponse.json({ recu: false }, { status: 503 })
  }
}
