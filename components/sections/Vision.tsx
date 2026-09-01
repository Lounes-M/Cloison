import { Button } from '@/components/ui/Button'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { vision } from '@/lib/content/home'
import { cn } from '@/lib/utils'

const useCaseTones = {
  paper: 'bg-paper',
  sun: 'bg-sun',
  mint: 'bg-mint',
  sky: 'bg-sky',
} as const

export function Vision() {
  return (
    <Section id="demarrer" className="pb-24 text-center">
      <Reveal>
        <div className="bg-cobalt shadow-brut-lg outlined relative overflow-hidden rounded-[24px] px-8 py-16 text-white md:px-12">
          <span
            aria-hidden
            className="animate-spin-slow absolute -top-8 -left-5 text-[120px] opacity-15"
          >
            ✳
          </span>
          <span
            aria-hidden
            className="animate-spin-slow absolute -right-2.5 -bottom-10 text-[140px] opacity-15 [animation-direction:reverse]"
          >
            ✳
          </span>

          <div className="relative">
            <h2 className="font-display mx-auto max-w-[820px] text-[clamp(1.75rem,4.5vw,38px)] leading-tight">
              {vision.headline[0]}
              <br />
              {vision.headline[1]} <span className="text-sun">{vision.headline[2]}</span>
            </h2>

            <p className="mx-auto mt-5 max-w-[600px] text-[17px] leading-relaxed font-medium">
              {vision.body}
            </p>

            <ul className="mt-7 flex flex-wrap justify-center gap-3">
              {vision.useCases.map((useCase) => (
                <li
                  key={useCase.label}
                  className={cn(
                    'text-ink outlined rounded-full px-4.5 py-2.5 text-[13.5px] font-bold',
                    useCaseTones[useCase.tone],
                  )}
                  style={{ rotate: `${useCase.tilt}deg` }}
                >
                  {useCase.label}
                </li>
              ))}
            </ul>

            <div className="mt-9">
              <Button href="#demarrer" tone="flame">
                {vision.cta} →
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  )
}
