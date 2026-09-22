import { NextResponse } from 'next/server'
import { z } from 'zod'
import { clientServeur } from '@/lib/acces/serveur'
import { secretCorrect } from '@/lib/exploitation/autorisation-cron'
import { clientYoutrustConfigure } from '@/lib/signature/configuration-youtrust'
import { environnementYoutrust, identifiantYoutrust } from '@/lib/signature/youtrust'

export const runtime = 'nodejs'
export const maxDuration = 55
const headers = { 'Cache-Control': 'no-store' }
const reservation = z.strictObject({
  id: identifiantYoutrust,
  reference_fournisseur: identifiantYoutrust,
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  bail: identifiantYoutrust,
})

export async function POST(requete: Request) {
  if (!secretCorrect(requete.headers.get('authorization'), process.env.CRON_SECRET))
    return new NextResponse(null, { status: 401, headers })
  if (process.env.YOUTRUST_REGISTRY_ENABLED !== 'true')
    return NextResponse.json({ actif: false, traites: 0, echecs: 0 }, { headers })
  let traites = 0,
    echecs = 0
  try {
    const mode = environnementYoutrust.parse(process.env.YOUTRUST_ENVIRONMENT)
    const client = clientYoutrustConfigure()
    const signal = AbortSignal.any([requete.signal, AbortSignal.timeout(45000)])
    const db = await clientServeur(signal)
    const file = await db.rpc('reserver_signatures_a_rapprocher', { le_mode: mode })
    const lignes = z.array(reservation).max(2).safeParse(file.data)
    if (
      file.error ||
      !lignes.success ||
      new Set(lignes.data.map((l) => l.id)).size !== lignes.data.length
    )
      throw new Error('File signature indisponible')
    for (const ligne of lignes.data) {
      try {
        signal.throwIfAborted()
        const distant = await client.lirePourRapprochement(ligne.reference_fournisseur)
        signal.throwIfAborted()
        const resultat = await db.rpc('confirmer_rapprochement_signature', {
          la_demande: ligne.id,
          le_mode: mode,
          le_bail: ligne.bail,
          la_revision: ligne.revision,
          la_reference: distant.id,
          reference_externe: distant.external_id,
          le_statut: distant.status,
        })
        if (resultat.error || resultat.data !== true) throw new Error('Rapprochement non confirme')
        traites++
      } catch {
        echecs++
        // En cas d'echec de cet appel, l'expiration du bail permet une reprise.
        await db.rpc('echec_rapprochement_signature', {
          la_demande: ligne.id,
          le_mode: mode,
          le_bail: ligne.bail,
        })
      }
    }
    const alertes = await db.rpc('signatures_a_examiner', { le_mode: mode })
    if (alertes.error || !Number.isSafeInteger(alertes.data) || alertes.data !== 0)
      throw new Error('Registre a examiner')
  } catch {
    echecs++
  }
  if (echecs) console.error('[signature] rapprochement a reprendre')
  return NextResponse.json(
    { actif: true, traites, echecs },
    { status: echecs ? 503 : 200, headers },
  )
}
