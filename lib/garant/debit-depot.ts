import 'server-only'
import { headers } from 'next/headers'
import { consommerDebit } from '@/lib/acces/debit'
import { clientServeur } from '@/lib/acces/serveur'

/** Apres verification de la capacite, avant lecture et analyse du document. */
export async function autoriserAnalyse(dossierId: string): Promise<boolean> {
  const entetes = await headers()
  const ip =
    entetes.get('x-forwarded-for')?.split(',')[0]?.trim() || entetes.get('x-real-ip') || 'inconnu'
  const db = await clientServeur()
  return (
    (await consommerDebit(db, 'depot_dossier', dossierId)) &&
    (await consommerDebit(db, 'depot_ip', ip)) &&
    (await consommerDebit(db, 'depot_global', 'tous-les-depots'))
  )
}
