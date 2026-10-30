import type { Metadata } from 'next'

import { Section } from '@/components/ui/Section'
import { juridique } from '@/lib/content/juridique'
import { questions as t } from '@/lib/content/questions'
import { DonneesStructurees } from '@/components/seo/DonneesStructurees'
import { faqStructuree } from '@/lib/seo/faq'

export const metadata: Metadata = {
  title: t.titre,
  description: t.description,
  alternates: { canonical: '/questions' },
}

/**
 * Les questions frequentes, par public.
 *
 * Des `details` natifs : chaque reponse s'ouvre au clavier et sans
 * JavaScript, et reste trouvable par la recherche du navigateur.
 */
export default function PageQuestions() {
  return (
    <main>
      <DonneesStructurees donnees={faqStructuree(t.groupes)} />
      <Section className="bg-cream py-12 md:py-16" innerClassName="max-w-[760px]">
        <h1 className="font-display text-3xl break-words uppercase sm:text-4xl md:text-5xl">
          {t.titre}
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed">{t.introduction}</p>
        <nav aria-label={t.sommaire} className="mt-6 flex flex-wrap gap-3">
          {t.groupes.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className="outlined bg-paper inline-flex min-h-11 items-center rounded-full px-4 text-[14px] font-bold"
            >
              {g.titre}
            </a>
          ))}
        </nav>
        <div className="mt-10 space-y-12">
          {t.groupes.map((g) => (
            <section
              key={g.id}
              id={g.id}
              aria-labelledby={`titre-${g.id}`}
              className="scroll-mt-24"
            >
              <h2 id={`titre-${g.id}`} className="font-display text-2xl uppercase">
                {g.titre}
              </h2>
              <div className="mt-4 space-y-3">
                {g.questions.map((q) => (
                  <details key={q.question} className="outlined bg-paper rounded-xl px-4 py-3">
                    <summary className="min-h-11 cursor-pointer py-2 text-[15px] font-bold">
                      {q.question}
                    </summary>
                    <p className="pb-2 text-[15px] leading-relaxed">{q.reponse}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
        <p className="text-muted mt-12 text-sm font-medium">
          <a href={juridique.liens.conditions.href} className="underline underline-offset-4">
            {juridique.liens.conditions.label}
          </a>
          {' · '}
          <a href={juridique.liens.confidentialite.href} className="underline underline-offset-4">
            {juridique.liens.confidentialite.label}
          </a>
        </p>
      </Section>
    </main>
  )
}
