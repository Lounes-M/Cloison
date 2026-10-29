import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { FormulaireAttributionLogement } from '@/components/forms/FormulaireAttributionLogement'
import { FormulaireNouveauDossier } from '@/components/forms/FormulaireNouveauDossier'
import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { reglerLaCandidature } from '@/lib/agences/action-logements'
import { contexteAgence } from '@/lib/agences/contexte'
import { candidature as tc } from '@/lib/content/candidature'
import { statuts } from '@/lib/content/espace'
import { logements as t } from '@/lib/content/logements'
import { euros } from '@/lib/content/tarifs'
import { site } from '@/lib/site'
import { estUuidCanonique } from '@/lib/validation/uuid'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: t.titre, robots: { index: false, follow: false } }

const tons = {
  sky: 'bg-sky',
  sun: 'bg-sun',
  mint: 'bg-mint',
  flame: 'bg-flame text-ink',
  paper: 'bg-paper',
} as const

type Candidat = {
  id: string
  reference: string
  statut: string
  engagements: { ratio: string | null } | { ratio: string | null }[] | null
}

function ratioDe(c: Candidat): number | null {
  const e = Array.isArray(c.engagements) ? c.engagements[0] : c.engagements
  return e?.ratio == null ? null : Number(e.ratio)
}

/**
 * Les candidats d'un logement, du plus solvable au moins solvable.
 *
 * Les dossiers sont lus avec les droits de l'agence : ce que la page montre
 * est exactement ce que l'espace montre deja, regroupe.
 */
export default async function PageLogement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!estUuidCanonique(id)) notFound()
  const c = await contexteAgence()
  if (c.etat !== 'rattache') redirect('/connexion')

  const [{ data: logement, error: e1 }, { data: dossiers, error: e2 }] = await Promise.all([
    c.supabase
      .from('logements')
      .select('id, libelle, loyer_cents, archive, code_candidature')
      .eq('id', id)
      .maybeSingle(),
    c.supabase
      .from('dossiers')
      .select('id, reference, statut, engagements(ratio)')
      .eq('logement_id', id)
      .eq('demonstration', false)
      .order('cree_le', { ascending: false })
      .limit(200),
  ])
  if (e1 || e2) throw new Error('Logement indisponible')
  if (!logement) notFound()

  const candidats = ((dossiers ?? []) as Candidat[])
    .map((d) => ({ ...d, ratio: ratioDe(d) }))
    .sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1))
  const retenus = candidats
    .filter((d) => d.statut === 'transmis' || d.statut === 'signe')
    .map((d) => ({ id: d.id, reference: d.reference }))
  const seuil = c.agence.seuilRatio
  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2 })
  const code = typeof logement.code_candidature === 'string' ? logement.code_candidature : null
  const lienCandidature = code ? `${site.url}/candidater/${code}` : null
  const loyer =
    logement.loyer_cents == null
      ? ''
      : (Number(logement.loyer_cents) / 100).toLocaleString('fr-FR', { useGrouping: false })

  return (
    <div className="page-espace w-full max-w-[960px]">
      <Link href="/espace/logements" className="lien-espace mb-6">
        {t.retourListe}
      </Link>
      <EnteteEspace
        titre={String(logement.libelle)}
        etiquette={logement.loyer_cents == null ? t.sansLoyer : euros(Number(logement.loyer_cents))}
      >
        {logement.archive ? <p>{t.archive}</p> : null}
      </EnteteEspace>

      <section
        className="panneau-espace relative overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={t.candidats.titre}
      >
        <h2 className="text-xl font-bold">{t.candidats.titre}</h2>
        {candidats.length === 0 ? (
          <p className="text-muted mt-3 text-[14px] font-medium">{t.candidats.aucun}</p>
        ) : (
          <table className="mt-4 w-full min-w-[480px] text-left text-[14px]">
            <thead>
              <tr className="border-ink/15 border-b">
                <th scope="col" className="py-2 pr-4 font-bold">
                  {t.candidats.reference}
                </th>
                <th scope="col" className="py-2 pr-4 font-bold">
                  {t.candidats.statut}
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-bold">
                  {t.candidats.ratio}
                </th>
              </tr>
            </thead>
            <tbody>
              {candidats.map((d) => {
                const statut = statuts[d.statut] ?? statuts.ouvert!
                return (
                  <tr key={d.id} className="border-ink/10 border-b last:border-0">
                    <th scope="row" className="py-2 pr-4 font-semibold">
                      <Link
                        href={`/espace/dossiers/${d.id}`}
                        className="text-cobalt underline underline-offset-2"
                      >
                        {d.reference}
                      </Link>
                    </th>
                    <td className="py-2 pr-4">
                      <span
                        className={cn(
                          'border-ink inline-block rounded-full border-2 px-3 py-0.5 text-[12px] font-bold',
                          tons[statut.ton],
                        )}
                      >
                        {statut.libelle}
                      </span>
                    </td>
                    <td
                      className={cn(
                        'py-2 pr-4 text-right tabular-nums',
                        d.ratio != null && d.ratio >= seuil && 'font-bold',
                      )}
                    >
                      {d.ratio == null ? t.candidats.attente : `${fmt(d.ratio)}×`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {!logement.archive ? (
        <section className="panneau-espace mt-8">
          <h2 className="text-xl font-bold">{tc.agence.titre}</h2>
          <p className="text-muted mt-2 mb-5 text-[14px] font-medium">
            {c.agence.statut === 'verifiee' ? tc.agence.aide : tc.agence.nonVerifiee}
          </p>
          {lienCandidature ? (
            <>
              <label htmlFor="lien-candidature" className="mb-2 block text-[14px] font-bold">
                {tc.agence.champ}
              </label>
              <input
                id="lien-candidature"
                readOnly
                value={lienCandidature}
                className="border-ink bg-paper w-full rounded-xl border-2 px-4 py-3 text-[16px] font-medium"
              />
              <p className="text-muted mt-2 text-[13px] font-medium">
                {tc.agence.renouvelerAide} {tc.agence.archive}
              </p>
            </>
          ) : c.agence.statut === 'verifiee' ? (
            <p className="text-[14px] font-medium">{tc.agence.ferme}</p>
          ) : null}
          {c.agence.statut === 'verifiee' || lienCandidature ? (
            <div className="mt-4 flex flex-wrap gap-3">
              {c.agence.statut === 'verifiee' ? (
                <form action={reglerLaCandidature}>
                  <input type="hidden" name="logement" value={id} />
                  <input type="hidden" name="candidature" value="ouvrir" />
                  <button
                    type="submit"
                    className="press outlined bg-sun rounded-brut cursor-pointer px-5 py-3 text-[14px] font-bold"
                  >
                    {lienCandidature ? tc.agence.renouveler : tc.agence.ouvrir}
                  </button>
                </form>
              ) : null}
              {lienCandidature ? (
                <form action={reglerLaCandidature}>
                  <input type="hidden" name="logement" value={id} />
                  <input type="hidden" name="candidature" value="fermer" />
                  <button
                    type="submit"
                    className="press outlined bg-paper rounded-brut cursor-pointer px-5 py-3 text-[14px] font-bold"
                  >
                    {tc.agence.fermer}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {!logement.archive && candidats.length > 0 ? (
        <section className="panneau-espace mt-8">
          <h2 className="text-xl font-bold">{t.attribution.titre}</h2>
          <p className="text-muted mt-2 mb-5 text-[14px] font-medium">
            {retenus.length > 0 ? t.attribution.aide : t.attribution.attente}
          </p>
          {retenus.length > 0 ? (
            <FormulaireAttributionLogement logementId={id} retenus={retenus} />
          ) : null}
        </section>
      ) : null}

      {!logement.archive ? (
        <section className="panneau-espace mt-8">
          <h2 className="text-xl font-bold">{t.candidats.ouvrir}</h2>
          <p className="text-muted mt-2 mb-5 text-[14px] font-medium">{t.candidats.ouvrirAide}</p>
          <FormulaireNouveauDossier
            verifiee={c.agence.statut === 'verifiee'}
            logementId={id}
            loyerParDefaut={loyer}
          />
        </section>
      ) : null}
    </div>
  )
}
