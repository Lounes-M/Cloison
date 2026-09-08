import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { clientServeur } from '@/lib/acces/serveur'
import { env } from '@/lib/env'
import { extraireEvenementCourriel, lireCorpsCourriel } from '@/lib/courriels/webhook'
export const runtime = 'nodejs'
export const maxDuration = 20
export async function POST(requete: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim()
  if (!secret) return NextResponse.json({ recu: false }, { status: 503 })
  try {
    const resend = new Resend(env.resendApiKey)
    const corps = await lireCorpsCourriel(requete)
    if (corps === null) return NextResponse.json({ recu: false }, { status: 413 })
    let evenement
    try {
      const id = requete.headers.get('svix-id') ?? ''
      const verifie = resend.webhooks.verify({
        payload: corps,
        webhookSecret: secret,
        headers: {
          id,
          timestamp: requete.headers.get('svix-timestamp') ?? '',
          signature: requete.headers.get('svix-signature') ?? '',
        },
      })
      evenement = extraireEvenementCourriel(verifie, id)
    } catch {
      return NextResponse.json({ recu: false }, { status: 400 })
    }
    if (!evenement) return NextResponse.json({ recu: true })
    const { data, error } = await (
      await clientServeur(AbortSignal.timeout(5000))
    ).rpc('enregistrer_evenement_courriel', evenement)
    if (error || typeof data !== 'boolean') throw new Error('Enregistrement non confirme')
    return NextResponse.json({ recu: true })
  } catch {
    console.error('[courriel] evenement a rejouer')
    return NextResponse.json({ recu: false }, { status: 503 })
  }
}
