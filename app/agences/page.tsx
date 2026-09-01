import type { Metadata } from 'next'
import { FormulaireAgence } from '@/components/forms/FormulaireAgence'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import {
  cequonapporte,
  commentCaMarche,
  douleurs,
  formulaire,
  heroAgences,
  tarifAgence,
} from '@/lib/content/agences'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Agences',
  description: heroAgences.sousTitre,
  alternates: { canonical: '/agences' },
}

const tonesApport = {
  sun: 'bg-sun',
  mint: 'bg-mint',
  sky: 'bg-sky',
} as const

export default function AgencesPage() {
  return (
    <main>
      {/* HERO */}
      <Section contained={false} className="pt-14 pb-16 text-center">
        <div className="mx-auto max-w-[1200px]">
          <p className="bg-ink text-sun inline-block rounded-full px-5 py-2 text-[13px] font-bold tracking-[0.06em] uppercase">
            {heroAgences.eyebrow}
          </p>
          <h1 className="font-display mx-auto mt-7 max-w-[900px] text-[clamp(2rem,6vw,60px)] leading-[1.05] uppercase">
            {heroAgences.titre[0]}
            <br />
            <span className="text-cobalt">{heroAgences.titre[1]}</span>
          </h1>
          <p className="mx-auto mt-7 max-w-[620px] text-lg leading-relaxed font-semibold">
            {heroAgences.sousTitre}
          </p>
          <div className="mt-9">
            <a
              href="#demander"
              className="press bg-flame outlined rounded-brut shadow-brut inline-flex items-center justify-center px-8 py-4 text-[17px] font-bold text-white"
            >
              {heroAgences.ancreFormulaire} →
            </a>
          </div>
        </div>
      </Section>

      {/* CE QUE ÇA COÛTE AUJOURD'HUI */}
      <Section className="border-ink bg-paper border-y-[3px] py-20">
        <Reveal>
          <p className="font-display text-flame mb-9 text-[15px] tracking-[0.06em] uppercase">
            {douleurs.eyebrow}
          </p>
        </Reveal>
        <ul className="grid gap-5 md:grid-cols-3">
          {douleurs.items.map((item, index) => (
            <li key={item.titre}>
              <Reveal delay={index * 0.08} className="h-full">
                <article className="border-ink h-full rounded-[18px] border-2 border-dashed p-7">
                  <h2 className="font-display mb-3 text-lg uppercase">{item.titre}</h2>
                  <p className="text-[15px] leading-relaxed font-medium">{item.texte}</p>
                </article>
              </Reveal>
            </li>
          ))}
        </ul>
      </Section>

      {/* CE QU'ON APPORTE */}
      <Section className="py-20">
        <Reveal>
          <h2 className="font-display mb-10 text-[clamp(2rem,5vw,46px)]">
            {cequonapporte.titre[0]} <span className="text-cobalt">{cequonapporte.titre[1]}</span>
          </h2>
        </Reveal>
        <ul className="grid gap-5 md:grid-cols-3">
          {cequonapporte.items.map((item, index) => (
            <li key={item.titre}>
              <Reveal delay={index * 0.08} className="h-full">
                <article
                  className={cn(
                    'lift outlined shadow-brut h-full rounded-[18px] p-7',
                    tonesApport[item.tone],
                  )}
                >
                  <h3 className="font-display mb-3 text-xl uppercase">{item.titre}</h3>
                  <p className="text-[15px] leading-relaxed font-medium">{item.texte}</p>
                </article>
              </Reveal>
            </li>
          ))}
        </ul>
        <Reveal>
          <div className="bg-ink text-cream mt-5 rounded-[18px] p-7">
            <h3 className="font-display text-sun mb-2 text-lg uppercase">
              {cequonapporte.garantie.titre}
            </h3>
            <p className="max-w-[70ch] text-[15px] leading-relaxed font-medium opacity-90">
              {cequonapporte.garantie.texte}
            </p>
          </div>
        </Reveal>
      </Section>

      {/* COMMENT ÇA MARCHE */}
      <Section className="border-ink bg-paper border-y-[3px] py-20">
        <Reveal>
          <h2 className="font-display mb-10 text-[clamp(2rem,5vw,46px)]">
            {commentCaMarche.titre}
          </h2>
        </Reveal>
        <ol className="grid gap-5 md:grid-cols-3">
          {commentCaMarche.etapes.map((etape, index) => (
            <li key={etape.numero}>
              <Reveal delay={index * 0.08} className="h-full">
                <div className="border-ink shadow-brut-sm h-full rounded-[18px] border-2 p-7">
                  <span className="bg-cobalt font-display mb-4 grid size-10 place-items-center rounded-full text-lg text-white">
                    {etape.numero}
                  </span>
                  <h3 className="font-display mb-2 text-lg uppercase">{etape.titre}</h3>
                  <p className="text-[15px] leading-relaxed font-medium">{etape.texte}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </Section>

      {/* TARIF */}
      <Section className="py-20">
        <Reveal>
          <h2 className="font-display mb-8 text-[clamp(2rem,5vw,46px)]">{tarifAgence.titre}</h2>
          <dl className="grid gap-5 md:grid-cols-3">
            {tarifAgence.points.map((point) => (
              <div key={point.libelle} className="bg-paper outlined shadow-brut rounded-[18px] p-7">
                <dt className="text-muted mb-2 text-[13px] font-bold tracking-[0.06em] uppercase">
                  {point.libelle}
                </dt>
                <dd className="font-display text-[26px] leading-tight">{point.valeur}</dd>
              </div>
            ))}
          </dl>
          <p className="bg-sun outlined mt-5 rounded-[18px] p-6 text-[15px] leading-relaxed font-bold">
            {tarifAgence.note}
          </p>
        </Reveal>
      </Section>

      {/* FORMULAIRE */}
      <Section id="demander" className="scroll-mt-28 pb-24">
        <div className="bg-paper outlined shadow-brut-lg rounded-[24px] p-8 md:p-12">
          <div className="mb-9">
            <p className="font-display text-flame mb-3 text-[15px] tracking-[0.06em] uppercase">
              {formulaire.eyebrow}
            </p>
            <h2 className="font-display max-w-[16ch] text-[clamp(1.75rem,4.5vw,40px)]">
              {formulaire.titre[0]} <span className="text-cobalt">{formulaire.titre[1]}</span>
            </h2>
            <p className="mt-4 max-w-[60ch] text-[16px] leading-relaxed font-semibold">
              {formulaire.sousTitre}
            </p>
          </div>
          <FormulaireAgence />
        </div>
      </Section>
    </main>
  )
}
