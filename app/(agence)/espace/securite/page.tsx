import type { Metadata } from 'next'
import Link from 'next/link'
import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { FormulaireApplicationSecours } from '@/components/forms/FormulaireApplicationSecours'
import { contexteApplicationSecours } from '@/lib/agences/application-secours'
import { applicationSecours as t } from '@/lib/content/application-secours'

export const metadata: Metadata = { title: t.titre, robots: { index: false, follow: false } }
export default async function PageApplicationSecours() {
  const c = await contexteApplicationSecours().catch(() => null)
  return (
    <div className="page-espace w-full max-w-[600px]">
      <Link href="/espace" className="lien-espace mb-6">
        {t.retour}
      </Link>
      <EnteteEspace titre={t.titre} etiquette={t.etiquette}>
        <p>{t.aide}</p>
      </EnteteEspace>
      <div className="panneau-espace">
        <p className="mb-6">{t.precaution}</p>
        {!c ? (
          <p role="alert">{t.erreur}</p>
        ) : c.verifies.length >= 2 ? (
          <p role="status">{t.disponible}</p>
        ) : (
          <FormulaireApplicationSecours facteur={c.attente?.id} />
        )}
      </div>
    </div>
  )
}
