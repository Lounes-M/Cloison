import { FormulaireTestApplication } from '@/components/forms/FormulaireTestApplication'
import { securite } from '@/lib/content/securite'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { NavigationReglages } from '@/components/layout/NavigationReglages'
import { FormulaireApplicationSecours } from '@/components/forms/FormulaireApplicationSecours'
import { contexteApplicationSecours } from '@/lib/agences/application-secours'
import { applicationSecours as t } from '@/lib/content/application-secours'
import { codesSecours as codes } from '@/lib/content/codes-secours'
import { lireCodesSecours, codesSecoursActifs } from '@/lib/agences/codes-secours'
import { FormulaireCodesSecours } from '@/components/forms/FormulaireCodesSecours'

export const metadata: Metadata = { title: t.titre, robots: { index: false, follow: false } }
export default async function PageApplicationSecours() {
  const c = await contexteApplicationSecours().catch(() => null)
  const secours = codesSecoursActifs()
    ? await lireCodesSecours().catch(() => ({ etat: 'indisponible' as const }))
    : null
  return (
    <div className="page-espace w-full max-w-[600px]">
      <Link href="/espace" className="lien-espace mb-6">
        {t.retour}
      </Link>
      <EnteteEspace titre={t.titre} etiquette={t.etiquette}>
        <p>{t.aide}</p>
      </EnteteEspace>
      <NavigationReglages courant="/espace/securite" />
      {secours && (
        <section className="panneau-espace mb-6" aria-labelledby="codes-recuperation">
          <h2 id="codes-recuperation" className="mb-3 text-xl font-bold">
            {codes.titre}
          </h2>
          <p className="mb-4">{codes.aide}</p>
          {secours.etat === 'indisponible' ? (
            <p role="status">{codes.indisponible}</p>
          ) : (
            <>
              <p className="mb-4">
                {secours.etat === 'pret' ? codes.restant(secours.restant) : codes.aucun}
              </p>
              <FormulaireCodesSecours facteur={secours.etat === 'pret' ? secours.id : undefined} />
            </>
          )}
        </section>
      )}
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
        ) : c.verifies.length >= 2 && !c.attente ? (
          <p role="status">{t.disponible}</p>
        ) : (
          <FormulaireApplicationSecours facteur={c.attente?.id} />
        )}
      </div>
    </div>
  )
}
