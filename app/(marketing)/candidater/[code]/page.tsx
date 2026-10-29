import type { Metadata } from 'next'
import Link from 'next/link'

import { FormulaireOuverture } from '@/components/forms/FormulaireOuverture'
import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { Section } from '@/components/ui/Section'
import { clientServeur } from '@/lib/acces/serveur'
import { candidature as t } from '@/lib/content/candidature'
import { euros } from '@/lib/content/tarifs'

export const metadata: Metadata = {
  title: t.page.titre,
  robots: { index: false, follow: false },
}

type Logement = { libelle: string; loyer_cents: number | null; agence: string }

async function logementDuCode(code: string): Promise<Logement | null> {
  if (!/^[a-f0-9]{32}$/.test(code)) return null
  const { data, error } = await (await clientServeur()).rpc('logement_par_code', { le_code: code })
  if (error) {
    console.error('[candidature] logement illisible')
    return null
  }
  return (Array.isArray(data) ? (data[0] as Logement | undefined) : null) ?? null
}

/**
 * La page d'un lien de candidature (migration 0070).
 *
 * Elle ne montre que ce que l'agence a choisi de publier : le libelle, le
 * loyer de reference et son nom. Un code faux, ferme ou d'une agence non
 * verifiee donne la meme page, sans dire lequel.
 */
export default async function PageCandidater({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const logement = await logementDuCode(code)

  if (!logement) {
    return (
      <Section className="espace-shell bg-cream py-6 md:py-12" innerClassName="max-w-[720px]">
        <EnteteEspace titre={t.page.invalideTitre} etiquette={t.page.etiquette} ton="sun">
          <p>{t.page.invalideTexte}</p>
        </EnteteEspace>
        <Link
          href="/demarrer"
          className="press outlined bg-flame shadow-brut rounded-brut inline-block px-8 py-4 text-[17px] font-bold"
        >
          {t.page.invalideBouton}
        </Link>
      </Section>
    )
  }

  return (
    <Section className="espace-shell bg-cream py-6 md:py-12" innerClassName="max-w-[720px]">
      <EnteteEspace titre={t.page.titre} etiquette={t.page.etiquette} ton="mint">
        <p>{t.page.intro(logement.agence)}</p>
      </EnteteEspace>
      <div className="panneau-espace">
        <p className="font-display text-2xl">{logement.libelle}</p>
        <dl className="mt-4 grid gap-3 text-[14px] sm:grid-cols-2">
          <div>
            <dt className="text-muted font-bold">{t.page.agence}</dt>
            <dd className="font-semibold">{logement.agence}</dd>
          </div>
          <div>
            <dt className="text-muted font-bold">{t.page.loyer}</dt>
            <dd className="font-semibold">
              {logement.loyer_cents == null
                ? t.page.sansLoyer
                : euros(Number(logement.loyer_cents))}
            </dd>
          </div>
        </dl>
      </div>
      <div className="panneau-espace mt-6">
        <FormulaireOuverture candidature={{ code, agence: logement.agence }} />
      </div>
      <details className="aide-espace mt-6">
        <summary>{t.page.dejaTitre}</summary>
        <p className="mt-3 text-[14px] leading-relaxed">{t.page.dejaTexte}</p>
        <p className="mt-3 text-[14px]">
          {t.page.code} : <code className="font-bold break-all">{code}</code>
        </p>
      </details>
    </Section>
  )
}
