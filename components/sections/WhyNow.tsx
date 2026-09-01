import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { goToMarket, whyNow } from '@/lib/content/home'

export function WhyNow() {
  return (
    <Section id="agences" className="pb-20 md:pb-22">
      <div className="grid gap-5 md:grid-cols-[1.2fr_1fr]">
        <Reveal>
          <div className="border-ink animate-wiggle h-full rounded-[18px] border-2 border-dashed p-8">
            <p className="font-display text-cobalt mb-3.5 text-[15px] uppercase">
              {whyNow.eyebrow}
            </p>
            <p className="text-lg leading-relaxed font-medium">
              {whyNow.body} <strong>{whyNow.emphasis}</strong>
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="bg-cobalt shadow-brut outlined h-full rounded-[18px] p-8 text-white">
            <p className="font-display text-sun mb-3.5 text-[15px] uppercase">
              {goToMarket.eyebrow}
            </p>
            <p className="mb-5 text-[15px] leading-relaxed font-medium">{goToMarket.body}</p>
            <dl className="flex gap-3">
              {goToMarket.metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="flex-1 rounded-xl border-[1.5px] border-white/40 bg-white/12 p-3 text-center"
                >
                  <dt className="sr-only">{metric.label}</dt>
                  <dd>
                    <span className="font-display block text-2xl">{metric.value}</span>
                    <span className="text-[11.5px] font-semibold opacity-85">{metric.label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>
      </div>
    </Section>
  )
}
