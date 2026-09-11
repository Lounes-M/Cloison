import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { historiqueResponsables as t } from '@/lib/content/historique-responsables'
import { lirePositionResponsables, pageResponsables } from '@/lib/agences/historique-responsables'

export async function HistoriqueResponsables({
  dossierId,
  supabase,
  position,
}: {
  dossierId: string
  supabase: SupabaseClient
  position: unknown
}) {
  const curseur = lirePositionResponsables(position, dossierId)
  let page: ReturnType<typeof pageResponsables> | null = null
  try {
    const { data, error } = await supabase.rpc('historique_responsables_du_dossier', {
      le_dossier: dossierId,
      avant_quand: curseur?.quand ?? null,
      avant_id: curseur?.id ?? null,
    })
    if (!error) page = pageResponsables(data, dossierId)
  } catch {
    /* Aucun detail technique ni donnee partielle affichee. */
  }
  return (
    <details id="historique-responsables" open={Boolean(curseur)} className="panneau-espace mt-4">
      <summary className="cursor-pointer font-bold">{t.titre}</summary>
      <p className="text-muted mt-3 text-sm">{t.aide}</p>
      {!page ? (
        <p role="status" className="mt-3 text-sm">
          {t.indisponible}
        </p>
      ) : (
        <>
          {!page.lignes.length ? (
            <p className="mt-3 text-sm">{t.vide}</p>
          ) : (
            <ol className="mt-4 space-y-4">
              {page.lignes.map((l) => (
                <li key={l.id} className="border-ink/20 border-t pt-3 text-sm">
                  <time dateTime={l.quand} className="font-bold">
                    {new Date(l.quand).toLocaleString('fr-FR', {
                      timeZone: 'Europe/Paris',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                  <p className="mt-1 break-all">
                    <span className="sr-only">{t.de} </span>
                    {l.precedent ? (l.precedent_email ?? t.ancien) : t.aucun}{' '}
                    <span aria-hidden="true">→</span> <span className="sr-only">{t.vers} </span>
                    {l.suivant ? (l.suivant_email ?? t.ancien) : t.aucun}
                  </p>
                  <p className="text-muted mt-1 break-all">
                    {t.par} {l.auteur ? (l.auteur_email ?? t.ancien) : t.technique}
                  </p>
                </li>
              ))}
            </ol>
          )}
          <nav aria-label={t.navigation} className="mt-4 flex flex-wrap gap-4 text-sm">
            {curseur ? (
              <Link
                className="lien-espace"
                href={`/espace/dossiers/${dossierId}#historique-responsables`}
              >
                {t.recent}
              </Link>
            ) : null}
            {page.suivant ? (
              <Link
                className="lien-espace"
                href={`/espace/dossiers/${dossierId}?affectations=${page.suivant}#historique-responsables`}
              >
                {t.suite}
              </Link>
            ) : null}
          </nav>
        </>
      )}
    </details>
  )
}
