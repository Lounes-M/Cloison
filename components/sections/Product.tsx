import { Icone } from '@/components/ui/Icone'
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
    <Section id="produit" className="border-ink/15 bg-paper border-y py-16 md:py-22">
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
                <article className="border-ink/20 bg-paper flex h-full flex-col overflow-hidden rounded-[18px] border">
                  <div
                    className={cn(
                      'border-ink/15 flex items-center justify-between border-b p-6',
                      tone.card,
                    )}
                  >
                    <Icone nom={space.icone} className="size-10" />
                    <span
                      className={cn(
                        'font-display grid size-8.5 place-items-center rounded-full text-[15px]',
                        tone.step,
                      )}
                    >
                      {space.step}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="font-display mb-3 text-xl uppercase">{space.title}</h3>
                    <p className="text-muted text-[15px] leading-relaxed font-medium">
                      {space.body}
                    </p>

                    <div className="mt-auto pt-6">
                      <div className="border-ink/15 flex flex-wrap items-center justify-between gap-2.5 border-t pt-4 text-xs font-bold">
                        <span className="flex items-center gap-2.5">{space.footnote.left}</span>
                        <span className="flex items-center gap-1.5">
                          {'right' in space.footnote ? space.footnote.right : null}
                          {'iconeDroite' in space.footnote ? (
                            <Icone nom={space.footnote.iconeDroite} />
                          ) : null}
                        </span>
                      </div>
                    </div>
                  </div>
                </article>
              </Reveal>
            </li>
          )
        })}
      </ul>

      <Reveal>
        <p className="mx-auto mt-8 max-w-[800px] text-center text-sm leading-loose font-medium">
          {product.outro}{' '}
          <span className="border-ink bg-sun rounded-lg border-[1.5px] px-2.5 py-0.5">
            {product.outroHighlight}
          </span>
        </p>
      </Reveal>
    </Section>
  )
}
