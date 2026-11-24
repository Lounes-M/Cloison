import Link from 'next/link'

import { Logo } from '@/components/brand/Logo'
import { BasculeLangue } from '@/components/langue/BasculeLangue'
import { FournisseurLangue } from '@/components/langue/LangueContexte'
import { NavigationAgence } from '@/components/layout/NavigationAgence'
import { logements as logementsEn } from '@/lib/content/en/logements'
import { logements as logementsFr } from '@/lib/content/logements'
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
import { cn } from '@/lib/utils'

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
  const logements = choisir(langue, logementsFr, logementsEn)
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
          <div className="entete-agence mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3 sm:px-8 lg:px-12">
            <div className="flex items-center gap-4">
              <Logo className="text-xl" langue={langue} />
              <span
                className={cn(
                  'border-ink/25 text-muted border-l pl-4 text-[13px] font-semibold tracking-wide uppercase',
                  agence && navigation && 'max-[1439px]:hidden',
                )}
              >
                {agence ? t.agence : t.porteur}
              </span>
            </div>
            {navigation && agence ? (
              <NavigationAgence
                libelle={t.navigation}
                menu={t.menu}
                liens={[
                  { href: '/espace', libelle: t.tableau },
                  { href: '/espace/logements', libelle: logements.lien },
                  {
                    href: '/espace/pilotage',
                    libelle: t.navPilotage,
                    aussi: ['/espace/activite'],
                  },
                  { href: '/espace/archives', libelle: signature.lienArchives },
                  { href: '/espace/facturation', libelle: facturation.lien },
                  {
                    href: '/espace/notifications',
                    libelle: t.reglages,
                    aussi: [
                      '/espace/securite',
                      '/espace/rappels',
                      '/espace/connecteurs',
                      '/espace/collaborateurs',
                    ],
                  },
                ]}
                langue={<BasculeLangue langue={langue} libelle={t.langue} />}
                sortie={sortie}
              />
            ) : (
              <nav aria-label={t.navigation} className="flex flex-wrap items-center gap-3">
                {navigation ? (
                  <Link href="/espace" className="lien-espace">
                    {t.tableau}
                  </Link>
                ) : null}
                <BasculeLangue langue={langue} libelle={t.langue} />
                {sortie}
              </nav>
            )}
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
