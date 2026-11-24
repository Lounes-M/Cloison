import { NextResponse } from 'next/server'
import { z } from 'zod'
import { clientServeur } from '@/lib/acces/serveur'
import { lireCorpsWebhook } from '@/lib/http/corps-webhook'
import { etatDocage } from '@/lib/signature/client-docage'
import { jetonDocageAccepte } from '@/lib/signature/configuration-docage'
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
 * Webhook Docage. Docage ne signe pas ses appels (`WebhookDTO.url` seulement) :
 * le jeton reste dans la query pour ne pas casser la production, et
 * `Authorization: Bearer` est accepte en plus. La notification ne fait que
 * reveiller la lecture de la transaction. L'etat du registre ne change qu'au
 * rapprochement, apres une relecture authentifiee par la cle API.
 */
export async function POST(requete: Request) {
  if (!registreSignatureActif() || prestataireActif() !== 'docage')
    return NextResponse.json({ recu: false }, { status: 503, headers })
  try {
    if (!jetonDocageAccepte(requete))
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
    // Docage ne donne aucun identifiant d'evenement : la base en derive un de la
    // transaction et de son etat (0085), et un rejeu ne fait que reveiller la lecture.
    const { data, error } = await db.rpc('enregistrer_reveil_docage', {
      le_mode: mode,
      la_reference: transaction,
      le_statut: etat,
    })
    if (error || !resultat.safeParse(data).success) throw new Error('Registre indisponible')
    return NextResponse.json({ recu: true }, { headers })
  } catch {
    // Phrase fixe : le message d'erreur peut contenir l'URL, donc le jeton.
    // Un journal applicatif n'accepte qu'un libelle constant.
    console.error('[signature] notification Docage a rejouer')
    return NextResponse.json({ recu: false }, { status: 503, headers })
  }
}
