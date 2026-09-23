import { NextResponse } from 'next/server'
import { z } from 'zod'
import { clientServeur } from '@/lib/acces/serveur'
import { secretCorrect } from '@/lib/exploitation/autorisation-cron'
import { clientYoutrustConfigure } from '@/lib/signature/configuration-youtrust'
import { configurationParcours } from '@/lib/signature/configuration-parcours'
import { chargerActe, traiterActe } from '@/lib/signature/parcours'
export const runtime = 'nodejs'
export const maxDuration = 60
const headers = { 'Cache-Control': 'no-store' }
export async function POST(requete: Request) {
  if (!secretCorrect(requete.headers.get('authorization'), process.env.CRON_SECRET))
    return new NextResponse(null, { status: 401, headers })
  let traites = 0,
    echecs = 0,
    effaces = 0
  const actif = process.env.SIGNATURE_PARCOURS_ENABLED === 'true'
  // La retention continue meme quand les nouveaux parcours sont fermes.
  try {
    const db = await clientServeur(AbortSignal.any([requete.signal, AbortSignal.timeout(10000)]))
    const expiration = await db.rpc('expirer_archives_signature')
    if (expiration.error) throw new Error()
    const file = await db.rpc('fichiers_archives_a_supprimer')
    const chemins = z
      .array(z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}$/))
      .max(10)
      .parse(file.data)
    if (file.error) throw new Error()
    for (const chemin of chemins) {
      const r = await db.storage.from('actes').remove([chemin])
      if (r.error) throw new Error()
      const confirmation = await db.rpc('acquitter_suppression_archive', { le_chemin: chemin })
      if (confirmation.error || confirmation.data !== true) throw new Error()
      effaces++
    }
  } catch {
    echecs++
  }
  if (actif) {
    try {
      const config = configurationParcours()!
      const signal = AbortSignal.any([requete.signal, AbortSignal.timeout(45000)])
      const db = await clientServeur(signal)
      const file = await db.rpc('actes_a_traiter', { le_mode: config.mode })
      const ids = z.array(z.uuid()).max(1).parse(file.data)
      if (file.error) throw new Error()
      for (const id of ids) {
        const d = await chargerActe(db, id)
        if (d.acte.etape !== 'en_cours' && process.env.YOUTRUST_MUTATIONS_ENABLED !== 'true')
          continue
        await traiterActe(db, id, config.mode, clientYoutrustConfigure(signal), signal)
        traites++
      }
      const anomalies = await db.rpc('operations_actes_a_examiner')
      if (anomalies.error || anomalies.data !== 0) throw new Error()
    } catch {
      echecs++
    }
  }
  if (echecs) console.error('[signature] traitement a reprendre')
  return NextResponse.json(
    { actif, traites, effaces, echecs },
    { status: echecs ? 503 : 200, headers },
  )
}
