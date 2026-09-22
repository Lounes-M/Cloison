import { NextResponse } from 'next/server'
import { z } from 'zod'
import { clientServeur } from '@/lib/acces/serveur'
import { lireOctetsWebhook } from '@/lib/http/corps-webhook'
import { verificateurYoutrustConfigure } from '@/lib/signature/configuration-youtrust'
import { environnementYoutrust } from '@/lib/signature/youtrust'

export const runtime = 'nodejs'
export const maxDuration = 20
const headers = { 'Cache-Control': 'no-store' }
const resultat = z.strictObject({ enregistre: z.literal(true), anomalie: z.boolean() })

export async function POST(requete: Request) {
  if (process.env.YOUTRUST_REGISTRY_ENABLED !== 'true')
    return NextResponse.json({ recu: false }, { status: 503, headers })
  try {
    const verifier = verificateurYoutrustConfigure()
    const mode = environnementYoutrust.parse(process.env.YOUTRUST_ENVIRONMENT)
    const corps = await lireOctetsWebhook(requete)
    if (corps === null) return NextResponse.json({ recu: false }, { status: 413, headers })
    const evenement = verifier(corps, requete.headers.get('x-yousign-signature-256'))
    if (!evenement) return NextResponse.json({ recu: false }, { status: 400, headers })
    const db = await clientServeur(AbortSignal.any([requete.signal, AbortSignal.timeout(5000)]))
    const { data, error } = await db.rpc('enregistrer_evenement_signature', {
      le_mode: mode,
      evenement: evenement.evenement,
      la_reference: evenement.transaction,
      le_statut: evenement.etat,
      survenu: new Date(evenement.creeLe * 1000).toISOString(),
    })
    if (error || !resultat.safeParse(data).success) throw new Error('Registre indisponible')
    // Acquitter seulement apres persistance, y compris un conflit durablement signale.
    return NextResponse.json({ recu: true }, { headers })
  } catch {
    console.error('[signature] notification a rejouer')
    return NextResponse.json({ recu: false }, { status: 503, headers })
  }
}
