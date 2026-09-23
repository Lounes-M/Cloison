import { Icone } from '@/components/ui/Icone'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { problem } from '@/lib/content/home'

export function Problem() {
  return (
    <Section id="probleme" className="py-20 md:py-24">
      <div className="grid items-center gap-14 md:grid-cols-[1fr_1.1fr]">
        <Reveal className="relative mx-auto w-full max-w-[440px]" tilt={-2}>
          <div className="bg-paper shadow-brut outlined rounded-[18px] px-5 py-6 sm:px-7">
            <p className="text-muted mb-2 text-xs font-bold">{problem.conversation.from}</p>
            <div className="flex flex-col gap-2">
              {problem.conversation.messages.map((message) => (
                <p
                  key={'fichier' in message ? message.fichier : message.texte}
                  className="border-ink/15 bg-mint/20 flex items-center gap-3 rounded-[12px_12px_12px_3px] border px-4 py-4 text-sm font-medium break-all"
                >
                  {'fichier' in message ? (
                    <>
                      <Icone nom="fichier" titre="Pièce jointe" />
                      {message.fichier}
                    </>
                  ) : (
                    message.texte
                  )}
                </p>
              ))}
            </div>
          </div>
          <p className="bg-flame font-display shadow-brut-sm outlined text-ink absolute right-2.5 -bottom-6 rotate-3 rounded-xl px-4 py-2.5 text-sm uppercase">
            {problem.conversation.stamp}
          </p>
        </Reveal>

        <Reveal>
          <p className="font-display text-flame mb-4 text-[15px] tracking-[0.06em] uppercase">
            {problem.eyebrow}
          </p>
          <h2 className="font-display max-w-[600px] text-[clamp(1.65rem,3vw,36px)] leading-tight text-balance uppercase">
            {problem.title}
          </h2>
          <p className="text-muted mt-5 max-w-[540px] text-base leading-relaxed font-medium">
            {problem.body}
          </p>
          <p className="border-flame mt-6 border-l-4 pl-4 text-lg leading-snug font-bold">
            {problem.punchline}
          </p>
        </Reveal>
      </div>
    </Section>
  )
}
