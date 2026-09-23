import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { pricing } from '@/lib/content/home'

export function Pricing() {
  return (
    <Section id="tarifs" className="py-20 md:py-22">
      <Reveal>
        <h2 className="font-display mb-11 text-center text-[clamp(2rem,5vw,46px)]">
          {pricing.headline[0]} <span className="text-flame">{pricing.headline[1]}</span>
        </h2>
      </Reveal>

      <ul className="grid items-stretch gap-5 md:grid-cols-3">
        {pricing.plans.map((plan, index) => (
          <li key={plan.audience}>
            <Reveal delay={index * 0.08} className="h-full">
              <article className="border-ink/20 bg-paper flex h-full flex-col rounded-[18px] border p-7">
                <p className="text-muted mb-3.5 text-[13px] font-bold tracking-[0.06em] uppercase">
                  {plan.audience}
                </p>
                <p className="font-display text-[clamp(1.5rem,3vw,32px)] leading-tight">
                  {plan.price}
                </p>
                <p className="border-ink/15 text-muted mt-6 border-t pt-5 text-sm leading-relaxed font-medium">
                  {plan.detail}
                </p>
              </article>
            </Reveal>
          </li>
        ))}

        {/* La regle d'or : le garant ne paie jamais. Volontairement de travers. */}
        <li>
          <Reveal delay={0.16} tilt={1.5} className="h-full">
            <article className="bg-sun shadow-brut outlined text-ink relative h-full rounded-[18px] p-7">
              <span className="bg-ink font-display text-sun outlined absolute -top-4 right-4.5 rotate-4 rounded-full px-3.5 py-1.5 text-xs uppercase">
                {pricing.goldenRule.tag}
              </span>
              <p className="mb-3.5 text-[13px] font-bold tracking-[0.06em] uppercase opacity-80">
                {pricing.goldenRule.audience}
              </p>
              <p className="font-display text-[28px] leading-tight uppercase">
                {pricing.goldenRule.price}
              </p>
              <p className="mt-3 text-[14.5px] leading-relaxed font-semibold">
                {pricing.goldenRule.detail}
              </p>
            </article>
          </Reveal>
        </li>
      </ul>
    </Section>
  )
}
