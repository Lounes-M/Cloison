import { Icone } from '@/components/ui/Icone'
import { LiveDot } from '@/components/ui/LiveDot'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { product, spaces } from '@/lib/content/home'
import { cn } from '@/lib/utils'

const spaceTones = {
  sun: { card: 'bg-sun', step: 'bg-ink text-sun' },
  mint: { card: 'bg-mint', step: 'bg-ink text-mint' },
  sky: { card: 'bg-sky', step: 'bg-ink text-sky' },
} as const

export function Product() {
  return (
    <Section id="produit" className="border-ink bg-paper border-y-[3px] py-20 md:py-22">
      <Reveal className="mb-11 flex flex-wrap items-end justify-between gap-8">
        <h2 className="font-display text-[clamp(2rem,5vw,46px)]">
          {product.headline[0]}
          <br />
          <span className="text-cobalt">{product.headline[1]}</span>
        </h2>
        <p className="max-w-[380px] text-base leading-relaxed font-semibold">{product.intro}</p>
      </Reveal>

      <ul className="grid gap-5 md:grid-cols-3">
        {spaces.map((space, index) => {
          const tone = spaceTones[space.tone]
          return (
            <li key={space.id}>
              <Reveal delay={index * 0.08} className="h-full">
                <article
                  className={cn(
                    'lift shadow-brut outlined flex h-full flex-col rounded-[18px] p-7',
                    tone.card,
                  )}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-display text-xl">{space.title}</h3>
                    <span
                      className={cn(
                        'font-display grid size-8.5 place-items-center rounded-full text-[15px]',
                        tone.step,
                      )}
                    >
                      {space.step}
                    </span>
                  </div>

                  <p className="text-[15px] leading-relaxed font-medium">{space.body}</p>

                  <div className="bg-paper outlined [margin-block-start:1.25rem] mt-auto flex items-center justify-between gap-2.5 rounded-xl px-4 pt-3 pb-3 text-[13px] font-bold">
                    <span className="flex items-center gap-2.5">
                      {'live' in space.footnote && space.footnote.live ? <LiveDot /> : null}
                      {space.footnote.left}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {'right' in space.footnote ? space.footnote.right : null}
                      {'iconeDroite' in space.footnote ? (
                        <Icone nom={space.footnote.iconeDroite} />
                      ) : null}
                    </span>
                  </div>
                </article>
              </Reveal>
            </li>
          )
        })}
      </ul>

      <Reveal>
        <p className="mt-9 text-center text-base font-bold">
          {product.outro}{' '}
          <span className="border-ink bg-sun rounded-lg border-[1.5px] px-2.5 py-0.5">
            {product.outroHighlight}
          </span>
        </p>
      </Reveal>
    </Section>
  )
}
