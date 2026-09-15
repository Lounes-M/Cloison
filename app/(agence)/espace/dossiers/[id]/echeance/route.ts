import { contexteAgence } from '@/lib/agences/contexte'
import { calendrierEcheance } from '@/lib/agences/calendrier'
import { estUuidCanonique } from '@/lib/validation/uuid'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15
const entetes = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
}
const refus = (status: number) =>
  new Response('Échéance indisponible.', { status, headers: entetes })

export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!estUuidCanonique(id)) return refus(404)
  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return refus(401)
  try {
    const maintenant = new Date()
    const { data, error } = await contexte.supabase
      .from('dossiers')
      .select('id, reference, expire_le')
      .eq('id', id)
      .gt('expire_le', maintenant.toISOString())
      .maybeSingle()
    if (error) return refus(503)
    if (!data) return refus(404)
    if (data.id !== id) return refus(503)
    return new Response(calendrierEcheance(data, maintenant), {
      headers: {
        ...entetes,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="echeance-cloison.ics"',
      },
    })
  } catch {
    return refus(503)
  }
}
