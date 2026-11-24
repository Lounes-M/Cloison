import { Accent, EnTetePage } from '@/components/ui/EnTetePage'
import { Photo } from '@/components/ui/Photo'
import { Reveal } from '@/components/ui/Reveal'
import { questions as questionsEn } from '@/lib/content/en/questions'
import { footerLinks as liensEn } from '@/lib/content/en/site'
import { groupesAffiches, questions as questionsFr } from '@/lib/content/questions'
import { choisir, lien, type Langue } from '@/lib/i18n'
import { footerLinks as liensFr } from '@/lib/site'
import { DonneesStructurees } from '@/components/seo/DonneesStructurees'
import { traitementsFacultatifs } from '@/lib/juridique/editeur'
import { faqStructuree } from '@/lib/seo/faq'
import { cn } from '@/lib/utils'

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
/** Garde le point d'interrogation colle au dernier mot, a la francaise. */
function insecable(texte: string) {
  return texte.replace(/ ([?!:;])/g, '\u00a0$1')
}

export function PageQuestions({ langue = 'fr' }: { langue?: Langue }) {
  const t = choisir(langue, questionsFr, questionsEn)
  // La reponse sur les pieces du garant suit les lectures reellement activees.
  const groupes = groupesAffiches(t.groupes, traitementsFacultatifs())
  const liens = choisir(langue, liensFr, liensEn)
  const juridiques = ['/conditions', '/confidentialite'].map((href) =>
    liens.find((l) => l.href === href)!,
  )
  return (
    <main>
      <DonneesStructurees donnees={faqStructuree(groupes)} />
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
        <nav
          aria-label={t.sommaire}
          className="flex flex-wrap justify-center gap-[0.375rem] max-[767px]:pb-[2.5rem]"
        >
          {groupes.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className="bg-paper hover:text-cobalt rounded-brut texte-14 inline-flex min-h-[44px] items-center px-[0.75rem] font-semibold uppercase transition-colors"
            >
              {g.titre}
            </a>
          ))}
        </nav>
      </EnTetePage>

      <section className="bg-cream gouttiere pt-[6.8rem] pb-[11.25rem] max-[767px]:pt-4 max-[767px]:pb-[3.75rem]">
        <div className="conteneur">
          <Reveal>
            <h2 className="titre-84">
              {t.liste[0]} <Accent>{t.liste[1]}</Accent>
            </h2>
          </Reveal>
          <div className="mt-[4rem] max-[767px]:mt-8">
            {groupes.map((g) => (
              <section
                key={g.id}
                id={g.id}
                aria-labelledby={`titre-${g.id}`}
                className="grid gap-4 border-b border-[#d6dfdd] py-[2.5rem] md:grid-cols-[26rem_1fr] md:gap-[4rem]"
              >
                <h3
                  id={`titre-${g.id}`}
                  className="texte-42 text-cobalt md:sticky md:top-[calc(var(--entete-total)+2rem)] md:self-start"
                >
                  {g.titre}
                </h3>
                <div>
                  {g.questions.map((q) => (
                    <details
                      key={q.question}
                      className="question-faq border-b border-[#d6dfdd] last:border-b-0"
                    >
                      <summary className="hover:text-cobalt flex min-h-[max(44px,3.5rem)] cursor-pointer list-none items-center justify-between gap-4 py-[0.75rem] font-semibold transition-colors [&::-webkit-details-marker]:hidden">
                        <span>{langue === 'fr' ? insecable(q.question) : q.question}</span>
                        <span
                          aria-hidden
                          className="chevron-question text-cobalt shrink-0 text-[1.5rem] leading-none font-normal"
                        >
                          +
                        </span>
                      </summary>
                      <p className="pb-[1.25rem]">{q.reponse}</p>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <p className="texte-16 mt-[2.5rem] font-medium">
            <a href={lien(langue, juridiques[0]!.href)} className="underline underline-offset-4">
              {juridiques[0]!.label}
            </a>
            {' · '}
            <a href={lien(langue, juridiques[1]!.href)} className="underline underline-offset-4">
              {juridiques[1]!.label}
            </a>
          </p>
        </div>
      </section>
    </main>
  )
}
