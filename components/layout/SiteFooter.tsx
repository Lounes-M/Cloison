import { Logo } from '@/components/brand/Logo'
import { AppelPrincipal } from '@/components/layout/AppelPrincipal'
import { Reveal } from '@/components/ui/Reveal'
import * as homeEn from '@/lib/content/en/home'
import * as siteEn from '@/lib/content/en/site'
import * as homeFr from '@/lib/content/home'
import { choisir, lien, type Langue } from '@/lib/i18n'
import * as siteFr from '@/lib/site'

/**
 * Pied de page du site public, sur toutes les pages : un bloc rose qui redit
 * le principe du produit, un dernier appel sur deux bandes inclinees, puis la
 * barre verte des liens.
 */
export function SiteFooter({ langue = 'fr' }: { langue?: Langue }) {
  const { hero } = choisir(langue, homeFr, homeEn)
  const { footerLinks, site, chrome } = choisir(langue, siteFr, siteEn)
  return (
    <footer className="bg-sun text-ink">
      <div className="gouttiere overflow-clip pt-[5.125rem] max-[479px]:pt-12">
        <div className="conteneur grid gap-3 md:grid-cols-[7.45rem_1fr]">
          <p className="texte-16 text-ink/75 font-semibold">{chrome.principe}</p>
          <div className="max-w-[44rem]">
            <p className="texte-24 max-[479px]:leading-[1.4]">{chrome.principeTexte}</p>
            <p className="texte-14 mt-3">{chrome.principeNote}</p>
          </div>
        </div>

        <Reveal variante="ressort" className="conteneur relative mt-[7.5rem] max-[479px]:mt-16">
          <div
            aria-hidden
            className="bg-cobalt absolute inset-x-0 -top-6 h-24 rounded-t-[1.5rem] [clip-path:polygon(0_45%,100%_0,100%_100%,0_100%)]"
          />
          <div
            aria-hidden
            className="bg-flame absolute inset-x-0 -top-3 h-24 rounded-t-[1.5rem] [clip-path:polygon(0_40%,100%_8%,100%_100%,0_100%)]"
          />
          <div className="bg-cream relative flex flex-col items-start justify-between gap-8 rounded-t-[1.5rem] px-[5.9rem] pt-[6rem] pb-[6.5rem] max-[767px]:px-6 max-[767px]:pt-14 max-[767px]:pb-14 md:flex-row md:items-center">
            <h2 className="texte-60 text-cobalt">{site.tagline}</h2>
            <AppelPrincipal langue={langue} libelle={hero.primaryCta} />
          </div>
        </Reveal>
      </div>

      <div className="bg-cobalt text-white">
        <div className="gouttiere texte-14 flex min-h-[4.76rem] flex-col gap-4 py-3 max-[1023px]:py-8 max-[479px]:text-[1rem] lg:flex-row lg:items-center lg:justify-between">
          <p className="flex items-center gap-3 whitespace-nowrap">
            <Logo langue={langue} variant="white" className="text-[1.15rem]" />
            <span>{site.tagline}</span>
          </p>
          <nav aria-label={chrome.navigationPied} className="flex flex-wrap gap-x-[1.5rem] gap-y-0">
            {footerLinks.map((link) => (
              <a
                key={link.href}
                href={lien(langue, link.href)}
                className="focus-visible:outline-sun inline-flex min-h-[44px] items-center underline underline-offset-4"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <p className="whitespace-nowrap">
            © {new Date().getFullYear()} {site.name}
          </p>
        </div>
      </div>
    </footer>
  )
}
