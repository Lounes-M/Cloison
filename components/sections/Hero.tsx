import { Button } from '@/components/ui/Button'
import { LiveDot } from '@/components/ui/LiveDot'
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
      className="relative overflow-hidden pt-14 pb-18 text-center md:pb-20"
    >
      {/* Étiquettes flottantes — décoratives, masquées sous lg pour laisser
          respirer le titre sur mobile. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
        {hero.badges.map((badge) => (
          <div
            key={badge.label}
            className={cn(
              'shadow-brut-sm outlined animate-float absolute rounded-xl px-4 py-2.5 text-sm font-bold',
              badgeTones[badge.tone],
              badge.position,
            )}
            style={{ rotate: `${badge.tilt}deg`, animationDelay: `${badge.delay}s` }}
          >
            {badge.label}
          </div>
        ))}

        <div
          className={cn(
            'bg-paper shadow-brut-sm outlined animate-float absolute flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold',
            hero.liveBadge.position,
          )}
          style={{
            rotate: `${hero.liveBadge.tilt}deg`,
            animationDelay: `${hero.liveBadge.delay}s`,
          }}
        >
          <LiveDot />
          {hero.liveBadge.label}
        </div>

        <div className="animate-spin-slow absolute bottom-10 left-[10%] text-[52px] leading-none">
          ✳
        </div>
        <div className="text-flame animate-spin-slow absolute top-15 right-[26%] text-[32px] leading-none [animation-direction:reverse]">
          ★
        </div>
      </div>

      <div className="relative mx-auto max-w-[1200px]">
        <p className="bg-ink text-sun animate-fade-up inline-block rounded-full px-5 py-2 text-[13px] font-bold tracking-[0.06em] uppercase">
          {hero.eyebrow}
        </p>

        <h1
          className="font-display animate-fade-up mx-auto mt-7 max-w-[1000px] text-[clamp(2.25rem,7vw,76px)] leading-[1.02] uppercase [animation-delay:0.15s]"
          style={{ animationFillMode: 'both' }}
        >
          Ton garant t&apos;aide.
          <br />
          Il ne te doit{' '}
          <span className="text-cobalt underline decoration-6 underline-offset-8">
            ni sa fiche de paie
          </span>
          ,<br />
          ni une signature{' '}
          <span className="border-ink bg-flame shadow-brut-sm inline-block -rotate-[1.5deg] rounded-[14px] border-[3px] px-4 text-white">
            à l&apos;aveugle.
          </span>
        </h1>

        <p
          className="animate-fade-up mx-auto mt-8 max-w-[560px] text-lg leading-relaxed font-semibold [animation-delay:0.3s]"
          style={{ animationFillMode: 'both' }}
        >
          {hero.subtitle}
        </p>

        <div
          className="animate-fade-up mt-9 flex flex-wrap justify-center gap-4 [animation-delay:0.45s]"
          style={{ animationFillMode: 'both' }}
        >
          <Button href="#demarrer">{hero.primaryCta} →</Button>
          <Button href="/agences" tone="paper">
            {hero.secondaryCta}
          </Button>
        </div>
      </div>
    </Section>
  )
}
