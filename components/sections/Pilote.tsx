import { Button } from '@/components/ui/Button'
import { Reveal } from '@/components/ui/Reveal'
import { pilote } from '@/lib/content/pilote'
import { hero } from '@/lib/content/home'
import { site } from '@/lib/site'

/**
 * Derniere section avant le pied de page : l'etat du pilote, puis un dernier
 * appel, sur une carte creme posee sur deux bandes inclinees.
 */
export function Pilote() {
  return (
    <section className="bg-sun -mt-[var(--radius-carte)] px-4 pt-[calc(var(--radius-carte)+4rem)] md:px-6">
      <div className="mx-auto grid max-w-[1280px] gap-4 md:grid-cols-[8rem_1fr] md:gap-10">
        <p className="text-muted text-sm">{pilote.statut}</p>
        <div className="max-w-[44rem]">
          <p className="font-display text-xl md:text-2xl">{pilote.avantOuverture}</p>
          <p className="mt-4 text-sm leading-relaxed">{pilote.signature}</p>
        </div>
      </div>

      <Reveal className="relative mx-auto mt-28 max-w-[1280px]">
        <div
          aria-hidden
          className="bg-cobalt absolute inset-x-0 -top-6 h-24 rounded-t-3xl [clip-path:polygon(0_45%,100%_0,100%_100%,0_100%)]"
        />
        <div
          aria-hidden
          className="bg-flame absolute inset-x-0 -top-3 h-24 rounded-t-3xl [clip-path:polygon(0_40%,100%_8%,100%_100%,0_100%)]"
        />
        <div className="bg-cream relative flex flex-col items-start justify-between gap-8 rounded-t-3xl px-6 pt-14 pb-16 md:flex-row md:items-center md:px-12 md:pt-20 md:pb-20">
          <h2 className="font-display text-cobalt text-[clamp(2rem,4.5vw,4rem)] leading-tight">
            {site.tagline}
          </h2>
          <Button href="/demarrer" tone="paper">
            {hero.primaryCta}
          </Button>
        </div>
      </Reveal>
    </section>
  )
}
