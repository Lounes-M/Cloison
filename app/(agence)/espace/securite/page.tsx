import { FormulaireTestApplication } from '@/components/forms/FormulaireTestApplication'
import { securite } from '@/lib/content/securite'
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
      {c ? (
        <section className="panneau-espace mb-6" aria-labelledby="applications-verifiees">
          <h2 id="applications-verifiees" className="mb-3 text-xl font-bold">
            {t.inventaire}
          </h2>
          <p className="mb-4">{t.aideTest}</p>
          <ul className="flex flex-col gap-4">
            {c.verifies.map((f, i) => (
              <li key={f.id} className="outlined rounded-lg p-4">
                <h3 className="font-bold">{securite.nomFacteur(i + 1, f.friendly_name)}</h3>
                <p>{t.verifiee}</p>
                <FormulaireTestApplication facteur={f.id} />
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm">{t.perte}</p>
        </section>
      ) : null}
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
