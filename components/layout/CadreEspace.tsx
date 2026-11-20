import Link from 'next/link'

import { Logo } from '@/components/brand/Logo'
import { BasculeLangue } from '@/components/langue/BasculeLangue'
import { FournisseurLangue } from '@/components/langue/LangueContexte'
import { facturation as facturationEn } from '@/lib/content/en/facturation'
import { interfaceEspace as interfaceEn } from '@/lib/content/en/interface'
import { juridique as juridiqueEn } from '@/lib/content/en/juridique'
import { signature as signatureEn } from '@/lib/content/en/signature'
import { facturation as facturationFr } from '@/lib/content/facturation'
import { interfaceEspace as interfaceFr } from '@/lib/content/interface'
import { juridique as juridiqueFr } from '@/lib/content/juridique'
import { signature as signatureFr } from '@/lib/content/signature'
import { choisir, lien as lienLangue } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'

/**
 * Identite commune, sans lecture de session ni decision d'autorisation.
 *
 * Le cadre lit la langue d'affichage une fois et la fournit aux composants
 * client de l'espace ; la bascule vit dans son en-tete.
 */
export async function CadreEspace({
  children,
  sortie,
  footer,
  agence = false,
  navigation = false,
}: {
  children: React.ReactNode
  sortie?: React.ReactNode
  footer?: React.ReactNode
  agence?: boolean
  navigation?: boolean
}) {
  const langue = await langueEspace()
  const t = choisir(langue, interfaceFr, interfaceEn)
  const signature = choisir(langue, signatureFr, signatureEn)
  const facturation = choisir(langue, facturationFr, facturationEn)
  const juridique = choisir(langue, juridiqueFr, juridiqueEn)
  return (
    <FournisseurLangue langue={langue}>
      <div
        lang={langue}
        className="espace-shell bg-cream flex min-h-dvh flex-col"
        data-espace={agence ? 'agence' : 'porteur'}
      >
        <a
          href="#contenu-espace"
          className="bg-sun outlined fixed top-3 left-3 z-50 -translate-y-32 rounded-lg px-4 py-3 font-bold focus:translate-y-0"
        >
          {t.principal}
        </a>
        <header className="border-ink bg-cream relative z-10 border-b-2">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8 lg:px-12">
            <div className="flex flex-wrap items-center gap-4">
              <Logo className="text-xl" langue={langue} />
              <span className="border-ink/25 text-muted border-l pl-4 text-[13px] font-semibold tracking-wide uppercase">
                {agence ? t.agence : t.porteur}
              </span>
            </div>
            <nav aria-label={t.navigation} className="flex flex-wrap items-center gap-3">
              {navigation ? (
                <Link href="/espace" className="lien-espace">
                  {t.tableau}
                </Link>
              ) : null}
              {navigation && agence ? (
                <>
                  <Link href="/espace/archives" className="lien-espace">
                    {signature.lienArchives}
                  </Link>
                  <Link href="/espace/facturation" className="lien-espace">
                    {facturation.lien}
                  </Link>
                </>
              ) : null}
              <BasculeLangue langue={langue} libelle={t.langue} />
              {sortie}
            </nav>
          </div>
        </header>
        <main
          id="contenu-espace"
          tabIndex={-1}
          className="espace-content relative mx-auto flex w-full max-w-[1280px] flex-1 justify-center px-5 py-6 sm:px-8 md:py-10 lg:px-12"
        >
          {children}
        </main>
        {footer}
        <nav
          aria-label={juridique.navigation}
          className="text-muted mx-auto flex w-full max-w-[1280px] flex-wrap gap-x-5 gap-y-1 px-5 py-4 text-[13px] font-medium sm:px-8 lg:px-12"
        >
          {Object.values(juridique.liens).map((lien) => (
            <a
              key={lien.href}
              href={lienLangue(langue, lien.href)}
              className="inline-flex min-h-[44px] items-center underline-offset-4 hover:underline"
            >
              {lien.label}
            </a>
          ))}
        </nav>
      </div>
    </FournisseurLangue>
  )
}
