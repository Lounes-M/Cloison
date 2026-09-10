import Link from 'next/link'
import type { ContexteAgence } from '@/lib/agences/contexte'
import {
  responsables as t,
  type ResponsableDossier as Affectation,
} from '@/lib/content/responsables'
import { FormulaireResponsable } from '@/components/forms/FormulaireResponsable'

export async function ResponsableDossier({
  dossierId,
  contexte,
  pageEquipe,
  modifiable,
}: {
  dossierId: string
  contexte: Extract<ContexteAgence, { etat: 'rattache' }>
  pageEquipe: unknown
  modifiable: boolean
}) {
  const page =
    typeof pageEquipe === 'string' && /^[1-9]\d{0,3}$/.test(pageEquipe)
      ? Math.min(Number(pageEquipe), 9999)
      : 1
  const admin = contexte.role === 'admin'
  const [lecture, equipe] = await Promise.all([
    contexte.supabase.rpc('responsables_des_dossiers', { les_dossiers: [dossierId] }),
    admin && modifiable
      ? contexte.supabase.rpc('collaborateurs_agence', { decalage: (page - 1) * 50 })
      : Promise.resolve({ data: [], error: null }),
  ])
  if (lecture.error || equipe.error) throw new Error('Chargement du responsable indisponible')
  const courant = (lecture.data as Affectation[] | null)?.[0]
  if (!courant) return null
  const membres = (equipe.data ?? []) as {
    utilisateur_id: string
    email: string | null
    etat: string
    admissible: boolean
  }[]
  const choix = membres
    .slice(0, 50)
    .filter((m) => m.admissible && m.email && ['admin', 'membre'].includes(m.etat))
    .map((m) => ({ id: m.utilisateur_id, email: m.email! }))
  if (
    courant.responsable_id &&
    courant.responsable_email &&
    !choix.some((m) => m.id === courant.responsable_id)
  )
    choix.unshift({ id: courant.responsable_id, email: courant.responsable_email })
  return (
    <section id="responsable" className="panneau-espace bg-sky/20 mt-8">
      <h2 className="font-display text-xl uppercase">{t.titre}</h2>
      <p className="mt-2 font-semibold break-all">
        {courant.responsable_id ? (courant.responsable_email ?? t.indisponible) : t.aucun}
      </p>
      <p className="mt-2 text-sm">{t.aide}</p>
      {modifiable ? (
        <FormulaireResponsable
          dossierId={dossierId}
          courant={courant}
          admin={admin}
          utilisateurId={contexte.utilisateurId}
          choix={choix}
        />
      ) : null}
      {admin && modifiable ? (
        <nav aria-label={t.navigation} className="mt-3 flex flex-wrap gap-4 text-sm">
          {page > 1 ? (
            <Link
              href={`/espace/dossiers/${dossierId}?equipe=${page - 1}#responsable`}
              className="lien-espace"
            >
              {t.precedent}
            </Link>
          ) : null}
          {membres.length > 50 && page < 9999 ? (
            <Link
              href={`/espace/dossiers/${dossierId}?equipe=${page + 1}#responsable`}
              className="lien-espace"
            >
              {t.suivant}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  )
}
