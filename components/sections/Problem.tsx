import { Icone } from '@/components/ui/Icone'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { problem } from '@/lib/content/home'

export function Problem() {
  return (
    <Section id="probleme" className="py-20 md:py-24">
      <div className="grid items-center gap-14 md:grid-cols-[1fr_1.1fr]">
        <Reveal className="relative" tilt={-2}>
          <div className="bg-paper shadow-brut outlined max-w-[400px] rounded-[18px] px-6 py-5">
            <p className="text-muted mb-2 text-xs font-bold">{problem.conversation.from}</p>
            <div className="flex flex-col gap-2">
              {problem.conversation.messages.map((message) => (
                <p
                  key={'fichier' in message ? message.fichier : message.texte}
                  className="border-ink flex items-center gap-2 rounded-[12px_12px_12px_3px] border-[1.5px] bg-[#e8f5e0] px-4 py-3 text-sm font-medium"
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
          <p className="bg-flame font-display shadow-brut-sm outlined absolute right-2.5 -bottom-6 rotate-3 rounded-xl px-4 py-2.5 text-sm text-white uppercase">
            {problem.conversation.stamp}
          </p>
        </Reveal>

        <Reveal>
          <p className="font-display text-flame mb-4 text-[15px] tracking-[0.06em] uppercase">
            {problem.eyebrow}
          </p>
          <p className="text-[23px] leading-snug font-medium text-pretty">{problem.body}</p>
          <p className="font-display mt-5 text-[23px] leading-tight">{problem.punchline}</p>
        </Reveal>
      </div>
    </Section>
  )
}
