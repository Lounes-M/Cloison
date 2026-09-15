import Link from 'next/link'
import type { ContexteAgence } from '@/lib/agences/contexte'
import type { ResponsableDossier } from '@/lib/content/responsables'
import { responsables as r } from '@/lib/content/responsables'
import { pilotage as t } from '@/lib/content/pilotage'
import { FormulaireAttributions } from '@/components/forms/FormulaireAttributions'

export async function AttributionsGroupees({
  contexte,
  lignes,
  responsables,
  pageEquipe,
  baseUrl,
}: {
  contexte: Extract<ContexteAgence, { etat: 'rattache' }>
  lignes: { id: string; reference: string; statut: string }[]
  responsables: Map<string, ResponsableDossier>
  pageEquipe: unknown
  baseUrl: `/espace?${string}`
}) {
  const page =
    typeof pageEquipe === 'string' && /^[1-9]\d{0,3}$/.test(pageEquipe) ? Number(pageEquipe) : 1
  let disponible = true
  let membres: {
    utilisateur_id: string
    email: string | null
    etat: string
    admissible: boolean
  }[] = []
  if (contexte.role === 'admin') {
    try {
      const { data, error } = await contexte.supabase.rpc('collaborateurs_agence', {
        decalage: (page - 1) * 50,
      })
      disponible = !error && Array.isArray(data)
      if (disponible) membres = data
    } catch {
      disponible = false
    }
  }
  const dossiers = lignes.flatMap((d) => {
    const affectation = responsables.get(d.id)
    if (
      !affectation ||
      !['ouvert', 'depot_en_cours', 'complet', 'garant_insuffisant', 'transmis'].includes(d.statut)
    )
      return []
    if (
      contexte.role !== 'admin' &&
      affectation.responsable_id &&
      affectation.responsable_id !== contexte.utilisateurId
    )
      return []
    return [{ id: d.id, reference: d.reference, revision: affectation.revision }]
  })
  return (
    <section id="attributions" className="panneau-espace mt-8">
      <h2 className="font-display text-xl uppercase">{t.lotTitre}</h2>
      <p className="mt-2 text-sm">{t.lotAide}</p>
      {!disponible ? (
        <p role="status" className="mt-3">
          {t.equipeIndisponible}
        </p>
      ) : null}
      <FormulaireAttributions
        key={baseUrl}
        dossiers={dossiers}
        disponible={disponible}
        utilisateurId={contexte.utilisateurId}
        choix={membres
          .slice(0, 50)
          .filter((m) => m.admissible && m.email && ['admin', 'membre'].includes(m.etat))
          .map((m) => ({ id: m.utilisateur_id, email: m.email! }))}
      />
      {contexte.role === 'admin' ? (
        <nav aria-label={r.navigation} className="mt-3 flex flex-wrap gap-4 text-sm">
          {page > 1 ? (
            <Link href={`${baseUrl}&equipe=${page - 1}#attributions`} className="lien-espace">
              {r.precedent}
            </Link>
          ) : null}
          {membres.length > 50 && page < 9999 ? (
            <Link href={`${baseUrl}&equipe=${page + 1}#attributions`} className="lien-espace">
              {r.suivant}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  )
}
