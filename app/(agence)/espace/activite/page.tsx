import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { libelleMois, totauxActivite, type MoisActivite } from '@/lib/agences/activite'
import { contexteAgence } from '@/lib/agences/contexte'
import { activite as t } from '@/lib/content/activite'

export const metadata: Metadata = { title: t.titre, robots: { index: false, follow: false } }

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })

/**
 * L'activite de l'agence sur douze mois.
 *
 * Tout membre y a acces : ce ne sont que des compteurs, que la base tient a
 * part des dossiers et qui survivent donc a leur purge (0068).
 */
export default async function PageActivite() {
  const c = await contexteAgence()
  if (c.etat !== 'rattache') redirect('/connexion')
  const { data, error } = await c.supabase.rpc('activite_de_mon_agence')
  if (error || !Array.isArray(data)) throw new Error('Activite indisponible')
  const lignes = data as MoisActivite[]
  const totaux = totauxActivite(lignes)

  const tuiles = [
    { titre: t.totaux.ouverts, valeur: fmt(totaux.ouverts) },
    {
      titre: t.totaux.acceptation,
      valeur: totaux.acceptation == null ? t.aucun : t.pourcent(fmt(totaux.acceptation)),
    },
    {
      titre: t.totaux.delai,
      valeur: totaux.delaiJours == null ? t.aucun : t.jours(fmt(totaux.delaiJours)),
    },
  ]

  return (
    <div className="page-espace w-full max-w-[960px]">
      <Link href="/espace" className="lien-espace mb-6">
        {t.retour}
      </Link>
      <EnteteEspace titre={t.titre} etiquette={t.etiquette}>
        <p>{t.aide}</p>
      </EnteteEspace>

      <dl className="mt-2 grid gap-4 text-[14px] md:grid-cols-3">
        {tuiles.map((tuile) => (
          <div key={tuile.titre} className="outlined bg-paper rounded-xl p-4">
            <dt className="text-muted text-[11px] font-bold tracking-wide uppercase">
              {tuile.titre}
            </dt>
            <dd className="font-display mt-1 text-2xl">{tuile.valeur}</dd>
          </div>
        ))}
      </dl>

      <div
        className="panneau-espace relative mt-8 overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={t.titre}
      >
        <table className="w-full min-w-[560px] text-left text-[14px]">
          <thead>
            <tr className="border-ink/15 border-b">
              <th scope="col" className="py-2 pr-4 font-bold">
                {t.colonnes.mois}
              </th>
              {(['ouverts', 'pris', 'refuses', 'signes', 'clos', 'delai'] as const).map((k) => (
                <th key={k} scope="col" className="py-2 pr-4 text-right font-bold">
                  {t.colonnes[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.mois} className="border-ink/10 border-b last:border-0">
                <th scope="row" className="py-2 pr-4 font-semibold capitalize">
                  {libelleMois(String(l.mois))}
                </th>
                <td className="py-2 pr-4 text-right tabular-nums">{l.ouverts}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{l.pris}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{l.refuses}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{l.signes}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{l.clos}</td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {l.delai_prise_moyen_jours == null
                    ? '-'
                    : t.jours(fmt(Number(l.delai_prise_moyen_jours)))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-muted mt-4 text-[13px] font-medium">{t.legende}</p>
      </div>
    </div>
  )
}
