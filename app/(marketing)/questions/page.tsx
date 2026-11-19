import type { Metadata } from 'next'

import { Accent, EnTetePage } from '@/components/ui/EnTetePage'
import { Photo } from '@/components/ui/Photo'
import { Reveal } from '@/components/ui/Reveal'
import { juridique } from '@/lib/content/juridique'
import { questions as t } from '@/lib/content/questions'
import { DonneesStructurees } from '@/components/seo/DonneesStructurees'
import { faqStructuree } from '@/lib/seo/faq'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: t.titre,
  description: t.description,
  alternates: { canonical: '/questions' },
}

/** L'eventail de photos sous le titre : inclinaison et decalage de chacune. */
const eventail = [
  { nom: 'intro-1', classe: '-rotate-6 mt-[6rem]' },
  { nom: 'intro-2', classe: '-rotate-3 mt-[3rem]' },
  { nom: 'intro-3', classe: 'rotate-0' },
  { nom: 'intro-5', classe: 'rotate-3 mt-[3rem]' },
  { nom: 'intro-7', classe: 'rotate-6 mt-[6rem]' },
] as const

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
      <EnTetePage
        titre={t.titre}
        sousTitre={<p>{t.introduction}</p>}
        visuel={
          <div className="flex justify-center gap-[1.25rem] max-[767px]:hidden">
            {eventail.map((photo) => (
              <Photo
                key={photo.nom}
                src={`/accueil/${photo.nom}.jpg`}
                sizes="(min-width: 768px) 15vw, 1px"
                className={cn('h-[20rem] w-[15.5rem] shrink-0 rounded-[1.5rem]', photo.classe)}
              />
            ))}
          </div>
        }
      >
        <nav aria-label={t.sommaire} className="flex flex-wrap justify-center gap-[0.375rem]">
          {t.groupes.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className="bg-paper hover:text-cobalt rounded-brut inline-flex min-h-[44px] items-center px-[0.75rem] text-[0.875rem] font-semibold uppercase transition-colors"
            >
              {g.titre}
            </a>
          ))}
        </nav>
      </EnTetePage>

      <section className="bg-cream gouttiere pt-[6.8rem] pb-[11.25rem] max-[767px]:py-[3.75rem]">
        <div className="conteneur">
          <Reveal>
            <h2 className="titre-84">
              {t.liste[0]} <Accent>{t.liste[1]}</Accent>
            </h2>
          </Reveal>
          <div className="mt-[4rem] max-[767px]:mt-8">
            {t.groupes.map((g) => (
              <section
                key={g.id}
                id={g.id}
                aria-labelledby={`titre-${g.id}`}
                className="grid gap-4 border-b border-[#d6dfdd] py-[2.5rem] md:grid-cols-[26rem_1fr] md:gap-[4rem]"
              >
                <h3 id={`titre-${g.id}`} className="texte-42 text-cobalt">
                  {g.titre}
                </h3>
                <div>
                  {g.questions.map((q) => (
                    <details key={q.question} className="border-b border-[#d6dfdd] last:border-b-0">
                      <summary className="flex min-h-[max(44px,3.5rem)] cursor-pointer items-center py-[0.75rem] font-semibold">
                        {q.question}
                      </summary>
                      <p className="pb-[1.25rem]">{q.reponse}</p>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <p className="texte-16 mt-[2.5rem] font-medium">
            <a href={juridique.liens.conditions.href} className="underline underline-offset-4">
              {juridique.liens.conditions.label}
            </a>
            {' · '}
            <a href={juridique.liens.confidentialite.href} className="underline underline-offset-4">
              {juridique.liens.confidentialite.label}
            </a>
          </p>
        </div>
      </section>
    </main>
  )
}
