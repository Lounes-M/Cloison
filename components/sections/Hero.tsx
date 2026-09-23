import { Button } from '@/components/ui/Button'
import { Icone } from '@/components/ui/Icone'
import { Section } from '@/components/ui/Section'
import { hero } from '@/lib/content/home'
import { cn } from '@/lib/utils'

const badgeTones = {
  sun: 'bg-sun',
  mint: 'bg-mint',
  sky: 'bg-sky',
} as const

export function Hero() {
  return (
    <Section
      contained={false}
      className="relative overflow-hidden pt-7 pb-12 text-center md:pt-8 md:pb-16"
    >
      {/* Les etiquettes restent dans le flux pour ne jamais recouvrir le titre. */}
      <div
        aria-hidden
        className="pointer-events-none mx-auto mb-6 hidden max-w-[900px] items-center justify-center gap-5 lg:flex"
      >
        {hero.badges.map((badge) => (
          <div
            key={badge.label}
            className={cn(
              'outlined rounded-full px-3 py-1 text-xs font-bold',
              badgeTones[badge.tone],
            )}
          >
            {badge.label}
            <Icone nom="coche" className="ml-1.5" />
          </div>
        ))}
      </div>

      <div className="relative mx-auto max-w-[1200px]">
        <p className="bg-ink text-sun animate-fade-up inline-block rounded-full px-5 py-2 text-[13px] font-bold tracking-[0.06em] uppercase">
          {hero.eyebrow}
        </p>

        <h1
          className="font-display animate-fade-up mx-auto mt-5 max-w-[850px] text-[clamp(1.7rem,4.8vw,56px)] leading-[1.08] text-balance uppercase [animation-delay:0.15s]"
          style={{ animationFillMode: 'both' }}
        >
          Ton garant t&apos;aide.
          <br />
          Il ne te doit{' '}
          <span className="text-cobalt underline decoration-3 underline-offset-4 md:decoration-6 md:underline-offset-8">
            ni sa fiche de paie
          </span>
          ,<br />
          ni une signature{' '}
          <span className="border-ink bg-flame shadow-brut-sm text-ink inline-block -rotate-[1.5deg] rounded-[14px] border-[3px] px-3 py-1 sm:px-4">
            à l&apos;aveugle.
          </span>
        </h1>

        <p
          className="animate-fade-up mx-auto mt-6 max-w-[560px] text-base leading-relaxed font-medium [animation-delay:0.3s]"
          style={{ animationFillMode: 'both' }}
        >
          {hero.subtitle}
        </p>

        <div
          className="animate-fade-up mt-6 flex flex-wrap justify-center gap-4 [animation-delay:0.45s]"
          style={{ animationFillMode: 'both' }}
        >
          <Button href="/demarrer">{hero.primaryCta} →</Button>
          <Button href="/agences" tone="paper">
            {hero.secondaryCta}
          </Button>
        </div>
      </div>
    </Section>
  )
}
