import { NextResponse } from 'next/server'
import { z } from 'zod'
import { clientServeur } from '@/lib/acces/serveur'
import { suivreTraitementActes } from '@/lib/exploitation/suivi-actes'
import { diagnosticActes, type EtapeDiagnosticActes } from '@/lib/exploitation/diagnostic-actes'
import { creerEntretienActes } from '@/lib/exploitation/entretien-actes'
import { clientYoutrustConfigure } from '@/lib/signature/configuration-youtrust'
import { configurationParcours } from '@/lib/signature/configuration-parcours'
import { chargerActe, traiterActe } from '@/lib/signature/parcours'
export const runtime = 'nodejs'
export const maxDuration = 60
const headers = { 'Cache-Control': 'no-store' }
export async function POST(requete: Request) {
  return suivreTraitementActes('archives', requete, executer)
}
async function executer(requete: Request) {
  const signaler = diagnosticActes()
  let etape: EtapeDiagnosticActes = 'archives_connexion'
  let traites = 0,
    echecs = 0,
    effaces = 0
  const actif = process.env.SIGNATURE_PARCOURS_ENABLED === 'true'
  // La retention continue meme quand les nouveaux parcours sont fermes.
  try {
    const signal = AbortSignal.any([requete.signal, AbortSignal.timeout(10000)])
    const db = await clientServeur(signal)
    const entretien = creerEntretienActes(db, signal)
    etape = 'archives_expiration'
    const expiration = await entretien.expirer()
    if (expiration.error) throw new Error()
    etape = 'archives_file_suppression'
    const file = await entretien.lireFile()
    const chemins = z
      .array(
        z.string().refine((v) => {
          const parties = v.split('/')
          return parties.length === 2 && parties.every((p) => z.uuid().safeParse(p).success)
        }),
      )
      .max(10)
      .refine((v) => new Set(v).size === v.length)
      .parse(file.data)
    if (file.error) throw new Error()
    for (const chemin of chemins) {
      etape = 'archives_budget_suppression'
      signal.throwIfAborted()
      let suppression: EtapeDiagnosticActes = 'archives_suppression'
      try {
        const r = await db.storage.from('actes').remove([chemin])
        if (r.error) throw new Error()
        suppression = 'archives_acquittement'
        const confirmation = await db.rpc('acquitter_suppression_archive', { le_chemin: chemin })
        if (confirmation.error || confirmation.data !== true) throw new Error()
        effaces++
      } catch {
        signaler(suppression)
        // Le chemin reste en file ; les autres suppressions peuvent encore aboutir.
        echecs++
      }
    }
  } catch {
    signaler(etape)
    echecs++
  }
  if (actif) {
    etape = 'actes_configuration'
    try {
      const config = configurationParcours()!
      const debut = performance.now()
      const signal = AbortSignal.any([requete.signal, AbortSignal.timeout(45000)])
      etape = 'actes_connexion'
      const db = await clientServeur(signal)
      const visites = new Set<string>()
      for (let tour = 0; tour < 5; tour++) {
        etape = 'actes_file'
        signal.throwIfAborted()
        // Garder au moins quinze secondes pour un nouvel acte et le controle final.
        if (performance.now() - debut >= 30000) break
        const file = await db.rpc('actes_a_traiter', { le_mode: config.mode })
        if (file.error) throw new Error()
        const ids = z.array(z.uuid()).max(1).parse(file.data)
        const id = ids[0]
        if (!id || visites.has(id)) break
        visites.add(id)
        try {
          signal.throwIfAborted()
          etape = 'actes_lecture'
          const d = await chargerActe(db, id)
          if (d.acte.etape !== 'en_cours' && process.env.YOUTRUST_MUTATIONS_ENABLED !== 'true')
            continue
          etape = 'actes_traitement'
          signal.throwIfAborted()
          await traiterActe(db, id, config.mode, clientYoutrustConfigure(signal), signal)
          traites++
        } catch {
          signaler(etape)
          echecs++
          // La reservation SQL persiste ; poursuivre uniquement les autres actes.
          if (signal.aborted) break
        }
      }
      etape = 'actes_anomalies'
      const anomalies = await db.rpc('operations_actes_a_examiner')
      if (anomalies.error || anomalies.data !== 0) throw new Error()
    } catch {
      signaler(etape)
      echecs++
    }
  }
  return NextResponse.json(
    { actif, traites, effaces, echecs },
    { status: echecs ? 503 : 200, headers },
  )
}
