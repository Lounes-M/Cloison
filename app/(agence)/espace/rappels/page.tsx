import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { FormulaireRappels } from '@/components/forms/FormulaireRappels'
import { NavigationReglages } from '@/components/layout/NavigationReglages'
import { interfaceEspace } from '@/lib/content/interface'
import { contexteAgence } from '@/lib/agences/contexte'
import { rappels as t, type ReglagesRappels } from '@/lib/content/rappels'
export const metadata: Metadata = { title: t.titre, robots: { index: false, follow: false } }
export default async function PageRappels() {
  const c = await contexteAgence()
  if (c.etat !== 'rattache') redirect('/connexion')
  if (c.role !== 'admin') notFound()
  const { data, error } = await c.supabase.rpc('reglages_rappels_agence')
  if (error || !data?.[0]) throw new Error('Reglages des rappels indisponibles')
  return (
    <div className="page-espace w-full max-w-[960px]">
      <Link href="/espace" className="lien-espace mb-6">
        {t.retour}
      </Link>
      <EnteteEspace titre={t.titre} etiquette={t.etiquette}>
        <p>{t.aide}</p>
      </EnteteEspace>
      <NavigationReglages courant="/espace/rappels" administration />
      <div className="panneau-espace">
        <FormulaireRappels courants={data[0] as ReglagesRappels} />
        <details className="aide-espace mt-6">
          <summary>{interfaceEspace.reglageDetails}</summary>
          <p>{t.limites}</p>
          <p className="mt-3">{t.preferences}</p>
          <p className="mt-3">{t.cadence}</p>
        </details>
      </div>
    </div>
  )
}
