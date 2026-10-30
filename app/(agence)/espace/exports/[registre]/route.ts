import { contexteAgence } from '@/lib/agences/contexte'
import { exporterRegistre, RegistreTropGrand, type Registre } from '@/lib/agences/exports-registres'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const prive = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
}
const registres: readonly string[] = ['archives', 'reglements', 'dossiers'] satisfies Registre[]

type LigneDossier = {
  id: string
  reference: string
  statut: string
  email_garant: string | null
  cree_le: string
  activite_rappel_le: string
  expire_le: string
  engagements: { ratio: unknown } | { ratio: unknown }[] | null
}

/** Une page de dossiers, sans l'adresse du garant : seule sa presence sort. */
function versExport(lignes: LigneDossier[]) {
  return lignes.map((l) => {
    const e = Array.isArray(l.engagements) ? l.engagements[0] : l.engagements
    return {
      id: l.id,
      reference: l.reference,
      statut: l.statut,
      garant: typeof l.email_garant === 'string' && l.email_garant.length > 0,
      ratio: e?.ratio ?? null,
      cree_le: l.cree_le,
      activite_le: l.activite_rappel_le,
      expire_le: l.expire_le,
    }
  })
}

function refus(status: number) {
  return new Response('Export indisponible.', { status, headers: prive })
}
export async function GET(req: Request, { params }: { params: Promise<{ registre: string }> }) {
  const { registre } = await params
  if (!registres.includes(registre)) return refus(404)
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(45000)])
  try {
    const c = await contexteAgence()
    if (c.etat !== 'rattache' || c.agence.statut !== 'verifiee') return refus(403)
    const csv = await exporterRegistre(
      registre as Registre,
      async (avant) => {
        if (registre === 'dossiers') {
          // Les droits et l'echeance restent imposes par la RLS (0003, 0033).
          let requete = c.supabase
            .from('dossiers')
            .select(
              'id, reference, statut, email_garant, cree_le, activite_rappel_le, expire_le, engagements(ratio)',
            )
            .eq('demonstration', false)
            .order('id', { ascending: true })
            .limit(20)
          if (avant) requete = requete.gt('id', avant)
          const r = await requete.abortSignal(signal)
          if (r.error) throw new Error('Lecture indisponible')
          return versExport((r.data ?? []) as LigneDossier[])
        }
        const r = await c.supabase
          .rpc(registre === 'archives' ? 'archives_de_mon_agence' : 'factures_de_mon_agence', {
            avant,
          })
          .abortSignal(signal)
        if (r.error) throw new Error('Lecture indisponible')
        return r.data
      },
      signal,
    )
    // Revalider la session, la MFA et le rattachement après la collecte paginée.
    const actuel = await contexteAgence()
    if (
      actuel.etat !== 'rattache' ||
      actuel.agence.statut !== 'verifiee' ||
      actuel.agence.id !== c.agence.id ||
      actuel.utilisateurId !== c.utilisateurId
    )
      return refus(403)
    signal.throwIfAborted()
    return new Response(csv, {
      headers: {
        ...prive,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cloison-${registre}.csv"`,
      },
    })
  } catch (erreur) {
    return refus(erreur instanceof RegistreTropGrand ? 413 : 503)
  }
}
