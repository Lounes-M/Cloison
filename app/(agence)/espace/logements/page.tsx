import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { FormulaireLogement } from '@/components/forms/FormulaireLogement'
import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { archiverUnLogement } from '@/lib/agences/action-logements'
import { contexteAgence } from '@/lib/agences/contexte'
import { logements as t } from '@/lib/content/logements'
import { euros } from '@/lib/content/tarifs'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: t.titre, robots: { index: false, follow: false } }

type Ligne = {
  id: string
  libelle: string
  loyer_cents: number | null
  archive: boolean
  candidats: number
  complets: number
  pris: number
}

/** Les logements de l'agence et, pour chacun, ou en sont ses candidats (0069). */
export default async function PageLogements({
  searchParams,
}: {
  searchParams?: Promise<{ archives?: string }>
}) {
  const c = await contexteAgence()
  if (c.etat !== 'rattache') redirect('/connexion')
  const avecArchives = (await searchParams)?.archives === '1'
  const { data, error } = await c.supabase.rpc('logements_de_mon_agence', {
    avec_archives: avecArchives,
  })
  if (error || !Array.isArray(data)) throw new Error('Logements indisponibles')
  const lignes = data as Ligne[]

  return (
    <div className="page-espace w-full max-w-[960px]">
      <Link href="/espace" className="lien-espace mb-6">
        {t.retour}
      </Link>
      <EnteteEspace titre={t.titre} etiquette={t.etiquette}>
        <p>{t.aide}</p>
      </EnteteEspace>

      <section className="panneau-espace">
        <h2 className="text-xl font-bold">{t.nouveau.titre}</h2>
        <div className="mt-4">
          <FormulaireLogement />
        </div>
      </section>

      <section
        className="panneau-espace relative mt-8 overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={t.titre}
      >
        {lignes.length === 0 ? (
          <p className="text-muted text-[14px] font-medium">{t.aucun}</p>
        ) : (
          <table className="w-full min-w-[600px] text-left text-[14px]">
            <thead>
              <tr className="border-ink/15 border-b">
                <th scope="col" className="py-2 pr-4 font-bold">
                  {t.colonnes.libelle}
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-bold">
                  {t.colonnes.loyer}
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-bold">
                  {t.colonnes.candidats}
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-bold">
                  {t.colonnes.complets}
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-bold">
                  {t.colonnes.pris}
                </th>
                <th scope="col" className="py-2">
                  <span className="sr-only">{t.archiver}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr
                  key={l.id}
                  className={cn('border-ink/10 border-b last:border-0', l.archive && 'opacity-60')}
                >
                  <th scope="row" className="py-2 pr-4 font-semibold">
                    <Link
                      href={`/espace/logements/${l.id}`}
                      className="text-cobalt underline underline-offset-2"
                    >
                      {l.libelle}
                    </Link>
                    {l.archive ? (
                      <span className="text-muted ml-2 text-[12px]">{t.archive}</span>
                    ) : null}
                  </th>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {l.loyer_cents == null ? t.sansLoyer : euros(Number(l.loyer_cents))}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{l.candidats}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{l.complets}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{l.pris}</td>
                  <td className="py-2 text-right">
                    <form action={archiverUnLogement}>
                      <input type="hidden" name="logement" value={l.id} />
                      <input type="hidden" name="archive" value={l.archive ? 'non' : 'oui'} />
                      <button
                        type="submit"
                        className="text-cobalt cursor-pointer text-[13px] font-bold underline underline-offset-2"
                      >
                        {l.archive ? t.desarchiver : t.archiver}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Link
          href={avecArchives ? '/espace/logements' : '/espace/logements?archives=1'}
          className="lien-espace mt-4"
        >
          {avecArchives ? t.masquerArchives : t.voirArchives}
        </Link>
      </section>
    </div>
  )
}
