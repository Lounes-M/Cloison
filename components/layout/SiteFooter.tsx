import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/Button'
import { Reveal } from '@/components/ui/Reveal'
import { hero } from '@/lib/content/home'
import { pilote } from '@/lib/content/pilote'
import { footerLinks, site } from '@/lib/site'

/**
 * Pied de page du site public, sur toutes les pages : un bloc rose qui dit
 * ou en est le pilote, un dernier appel sur deux bandes inclinees, puis la
 * barre verte des liens.
 */
export function SiteFooter() {
  return (
    <footer className="bg-sun text-ink">
      <div className="gouttiere pt-[5.125rem] max-[479px]:pt-12">
        <div className="conteneur grid gap-3 md:grid-cols-[7.45rem_1fr]">
          <p className="texte-16 text-ink/75 font-semibold">{pilote.statut}</p>
          <div className="max-w-[44rem]">
            <p className="texte-24 max-[479px]:text-[1.125rem] max-[479px]:leading-[1.4]">
              {pilote.avantOuverture}
            </p>
            <p className="texte-14 mt-3">{pilote.signature}</p>
          </div>
        </div>

        <Reveal className="conteneur relative mt-[7.5rem] max-[479px]:mt-16">
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
            <Button href="/demarrer" tone="paper">
              {hero.primaryCta}
            </Button>
          </div>
        </Reveal>
      </div>

      <div className="bg-cobalt text-white">
        <div className="gouttiere flex min-h-[4.76rem] flex-col gap-4 py-3 text-[0.95rem] max-[1023px]:py-8 lg:flex-row lg:items-center lg:justify-between">
          <p className="flex items-center gap-3">
            <Logo variant="white" className="text-[1.15rem]" />
            <span>{site.tagline}</span>
          </p>
          <nav
            aria-label="Navigation de pied de page"
            className="flex flex-wrap gap-x-[1.5rem] gap-y-0"
          >
            {footerLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="focus-visible:outline-sun inline-flex min-h-[44px] items-center underline underline-offset-4"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <p>
            © {new Date().getFullYear()} {site.name}
          </p>
        </div>
      </div>
    </footer>
  )
}
