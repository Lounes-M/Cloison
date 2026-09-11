import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { FormulairePreferences } from '@/components/forms/FormulairePreferences'
import { contexteAgence } from '@/lib/agences/contexte'
import { preferences as t, type PreferenceNotifications } from '@/lib/content/preferences'
export const metadata: Metadata = { title: t.titre, robots: { index: false, follow: false } }
export default async function PageNotifications() {
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
      <div className="panneau-espace">
        <p className="mb-4">{t.limites}</p>
        <p className="mb-6 text-sm">{t.mes}</p>
        <FormulairePreferences courante={data[0] as PreferenceNotifications} />
      </div>
    </div>
  )
}
