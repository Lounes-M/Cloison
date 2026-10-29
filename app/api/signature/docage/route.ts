import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { clientServeur } from '@/lib/acces/serveur'
import { lireCorpsWebhook } from '@/lib/http/corps-webhook'
import { etatDocage } from '@/lib/signature/client-docage'
import { verifierJetonDocage } from '@/lib/signature/configuration-docage'
import {
  modeSignature,
  prestataireActif,
  registreSignatureActif,
} from '@/lib/signature/configuration-prestataire'

export const runtime = 'nodejs'
export const maxDuration = 20
const headers = { 'Cache-Control': 'no-store' }
const resultat = z.strictObject({ enregistre: z.literal(true), anomalie: z.boolean() })
const notification = z.looseObject({
  id: z.uuid().optional(),
  Id: z.uuid().optional(),
  globalStatus: z.union([z.number(), z.string()]).optional(),
  GlobalStatus: z.union([z.number(), z.string()]).optional(),
})

/**
 * Webhook Docage. Docage ne signe pas ses appels : l'URL enregistree porte un
 * jeton secret, et la notification ne fait que reveiller la lecture de la
 * transaction. L'etat du registre ne change qu'au rapprochement, apres une
 * relecture authentifiee par la cle API.
 */
export async function POST(requete: Request) {
  if (!registreSignatureActif() || prestataireActif() !== 'docage')
    return NextResponse.json({ recu: false }, { status: 503, headers })
  try {
    if (!verifierJetonDocage(new URL(requete.url).searchParams.get('jeton')))
      return NextResponse.json({ recu: false }, { status: 401, headers })
    const mode = modeSignature()
    const corps = await lireCorpsWebhook(requete)
    if (corps === null) return NextResponse.json({ recu: false }, { status: 413, headers })
    let brut: unknown = null
    try {
      brut = JSON.parse(corps)
    } catch {}
    const lu = notification.safeParse(brut)
    const transaction = lu.success ? (lu.data.id ?? lu.data.Id) : undefined
    const etat = lu.success ? etatDocage(lu.data.globalStatus ?? lu.data.GlobalStatus) : null
    if (!transaction || !etat) return NextResponse.json({ recu: false }, { status: 400, headers })
    const db = await clientServeur(AbortSignal.any([requete.signal, AbortSignal.timeout(5000)]))
    // Docage ne donne aucun identifiant d'evenement : chaque appel est un reveil distinct.
    const { data, error } = await db.rpc('enregistrer_evenement_signature', {
      le_mode: mode,
      evenement: randomUUID(),
      la_reference: transaction,
      le_statut: etat,
      survenu: new Date().toISOString(),
    })
    if (error || !resultat.safeParse(data).success) throw new Error('Registre indisponible')
    return NextResponse.json({ recu: true }, { headers })
  } catch {
    console.error('[signature] notification Docage a rejouer')
    return NextResponse.json({ recu: false }, { status: 503, headers })
  }
}
