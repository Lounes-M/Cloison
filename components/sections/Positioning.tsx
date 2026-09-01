import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { positioning } from '@/lib/content/home'

export function Positioning() {
  return (
    <Section id="positionnement" className="bg-ink text-cream py-20 md:py-22">
      <Reveal>
        <h2 className="font-display mb-3 text-[clamp(2rem,5vw,46px)]">
          {positioning.headline[0]} <span className="text-sun">{positioning.headline[1]}</span>
        </h2>
        <p className="text-sun mb-10 text-base font-semibold">{positioning.subtitle}</p>
      </Reveal>

      <ul className="grid gap-5 md:grid-cols-3">
        {positioning.players.map((player, index) => (
          <li key={player.name}>
            <Reveal delay={index * 0.08} className="h-full">
              <article className="border-cream h-full rounded-2xl border-2 p-6 transition-[background-color,translate] duration-150 hover:-translate-y-1 hover:bg-[#1f1f1f]">
                <div className="mb-3.5 flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-lg uppercase">{player.name}</h3>
                  <span className="border-cream shrink-0 rounded-full border-[1.5px] px-2.5 py-1 text-[11px] font-bold opacity-70">
                    {player.role}
                  </span>
                </div>
                <p className="text-[14.5px] leading-relaxed opacity-85">{player.body}</p>
              </article>
            </Reveal>
          </li>
        ))}
      </ul>
    </Section>
  )
}
