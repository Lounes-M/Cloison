import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BasculeLangue } from '@/components/langue/BasculeLangue'
import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { FormulairePreferences } from '@/components/forms/FormulairePreferences'
import { NavigationReglages } from '@/components/layout/NavigationReglages'
import { interfaceEspace as interfaceEspaceFr } from '@/lib/content/interface'
import { contexteAgence } from '@/lib/agences/contexte'
import { preferences as tFr, type PreferenceNotifications } from '@/lib/content/preferences'
import { interfaceEspace as interfaceEspaceEn } from '@/lib/content/en/interface'
import { preferences as tEn } from '@/lib/content/en/preferences'
import { choisir } from '@/lib/i18n'
import { langueEspace, titreEspace } from '@/lib/langue-espace'
export const generateMetadata = () => titreEspace(tFr.titre, tEn.titre)
export default async function PageNotifications() {
  const langue = await langueEspace()
  const t = choisir(langue, tFr, tEn)
  const interfaceEspace = choisir(langue, interfaceEspaceFr, interfaceEspaceEn)

  const c = await contexteAgence()
  if (c.etat !== 'rattache') redirect('/connexion')
  const { data, error } = await c.supabase.rpc('mes_preferences_notifications')
  if (error || !data?.[0]) throw new Error('Preferences indisponibles')
  return (
    <div className="page-espace w-full max-w-[960px]">
      <Link href="/espace" className="lien-espace mb-6">
        {t.retour}
      </Link>
      <EnteteEspace titre={t.titre} etiquette={t.etiquette}>
        <p>{t.aide}</p>
      </EnteteEspace>
      <NavigationReglages courant="/espace/notifications" administration={c.role === 'admin'} />
      <div className="panneau-espace">
        <FormulairePreferences courante={data[0] as PreferenceNotifications} />
        <details className="aide-espace mt-6">
          <summary>{interfaceEspace.reglageDetails}</summary>
          <p>{t.limites}</p>
          <p className="mt-3">{t.mes}</p>
        </details>
      </div>
      <section className="panneau-espace mt-6" aria-labelledby="langue-preferee">
        <h2 id="langue-preferee" className="text-xl font-bold">
          {interfaceEspace.langueTitre}
        </h2>
        <p className="text-muted mt-2 mb-4 text-[14px] leading-relaxed font-medium">
          {interfaceEspace.langueAide}
        </p>
        <BasculeLangue langue={langue} libelle={interfaceEspace.langue} />
      </section>
    </div>
  )
}
