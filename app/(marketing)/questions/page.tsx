import type { Metadata } from 'next'

import { EnTetePage } from '@/components/ui/EnTetePage'
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
      <EnTetePage titre={t.titre} sousTitre={<p>{t.introduction}</p>}>
        <nav aria-label={t.sommaire} className="flex flex-wrap justify-center gap-3">
          {t.groupes.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className="bg-paper hover:text-cobalt rounded-brut inline-flex min-h-11 items-center px-4 text-[13px] font-semibold tracking-[0.02em] uppercase transition-colors"
            >
              {g.titre}
            </a>
          ))}
        </nav>
      </EnTetePage>
      <Section className="bg-cream py-16 md:py-24" innerClassName="max-w-[860px]">
        <div className="space-y-16">
          {t.groupes.map((g) => (
            <section
              key={g.id}
              id={g.id}
              aria-labelledby={`titre-${g.id}`}
              className="scroll-mt-24"
            >
              <h2 id={`titre-${g.id}`} className="font-display text-cobalt text-3xl md:text-4xl">
                {g.titre}
              </h2>
              <div className="mt-4 space-y-3">
                {g.questions.map((q) => (
                  <details key={q.question} className="bg-paper rounded-brut-lg px-5 py-3">
                    <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold">
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
