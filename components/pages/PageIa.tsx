import Link from 'next/link'
import type { Route } from 'next'

import { Button } from '@/components/ui/Button'
import { Accent, EnTetePage } from '@/components/ui/EnTetePage'
import { Icone, type NomIcone } from '@/components/ui/Icone'
import { Reveal } from '@/components/ui/Reveal'
import * as en from '@/lib/content/en/ia'
import * as fr from '@/lib/content/ia'
import { choisir, lien, type Langue } from '@/lib/i18n'
import { traitementsFacultatifs } from '@/lib/juridique/editeur'
import { cn } from '@/lib/utils'

/** Une carte par interdit : couleurs, inclinaison, decalage, comme l'accueil. */
const cartesJamais: { classe: string; icone: NomIcone; inclinaison: number; decalage: string }[] = [
  { classe: 'bg-cobalt text-sun', icone: 'cadenas', inclinaison: -8, decalage: 'lg:mt-0' },
  { classe: 'bg-sun text-cobalt', icone: 'acte', inclinaison: 0, decalage: 'lg:mt-[3.3rem]' },
  { classe: 'bg-ink text-sun', icone: 'etoile', inclinaison: -4, decalage: 'lg:mt-[1.8rem]' },
  { classe: 'bg-flame text-ink', icone: 'fichier', inclinaison: 6, decalage: 'lg:mt-[0.6rem]' },
]

const ICONES_GARANTIES: Record<string, NomIcone> = {
  conservation: 'cadenas',
  europe: 'direction',
  journal: 'fichier',
  ephemere: 'eclair',
  quota: 'asterisque',
  facultatif: 'coche',
}

/**
 * « Notre usage de l'IA » : ce qu'elle fait, ce qu'elle ne fait jamais, et ce
 * qui le garantit. La page lit la configuration reelle : un usage desactive
 * est annonce comme tel. La carte OpenRouter dit le sous-traitant reel :
 * societe americaine, et serveur europeen seulement si l'endpoint l'impose.
 */
export function PageIa({ langue = 'fr' }: { langue?: Langue }) {
  const { deroule, garanties, heroIa, jamais, lectureOpenRouter, suiteIa, usages } = choisir(
    langue,
    fr,
    en,
  )
  const facultatifs = traitementsFacultatifs()
  const actif: Record<string, boolean> = {
    garant: facultatifs.lectureGarant,
    agence: facultatifs.ocr,
    comparaison: facultatifs.comparaisonAgence,
  }
  const lectureDemandee =
    facultatifs.lectureGarant || facultatifs.ocr || facultatifs.comparaisonAgence
  const libelleLecture = !lectureDemandee
    ? lectureOpenRouter.inactive
    : facultatifs.lectureEnEurope
      ? lectureOpenRouter.europe
      : lectureOpenRouter.horsEurope
  const garantiesAffichees = garanties.items.map((item) =>
    item.cle === 'europe'
      ? { ...item, titre: lectureOpenRouter.titre, libelle: libelleLecture }
      : item,
  )
  return (
    <main>
      <EnTetePage
        surtitre={heroIa.eyebrow}
        titre={
          <>
            {heroIa.titre[0]} <Accent>{heroIa.titre[1]}</Accent> {heroIa.titre[2]}
          </>
        }
        sousTitre={<p>{heroIa.sousTitre}</p>}
      >
        <div className="flex justify-center">
          <Button href="#usages" tone="paper">
            {heroIa.ancre}
          </Button>
        </div>
      </EnTetePage>

      {/* TROIS USAGES : trois grandes cartes blanches */}
      <section
        id="usages"
        className="bg-cream gouttiere scroll-mt-[var(--entete-total)] pt-[6.9rem] pb-[11.25rem] max-[767px]:py-[3.75rem]"
      >
        <div className="conteneur">
          <Reveal>
            <h2 className="titre-84 text-center">
              {usages.titre[0]} <Accent>{usages.titre[1]}</Accent>
            </h2>
          </Reveal>
          <ul className="mt-[5.7rem] grid gap-[1.66rem] max-[767px]:mt-10 md:grid-cols-2 lg:grid-cols-3">
            {usages.items.map((item, index) => (
              <li key={item.cle}>
                <Reveal delay={index * 0.08} className="h-full">
                  <article className="lift bg-paper flex h-full flex-col rounded-[1.5rem] p-[2rem] max-[479px]:p-[1.5rem]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="texte-16 font-semibold">{item.pour}</span>
                      <span
                        className={cn(
                          'texte-14 inline-flex items-center gap-2 rounded-full px-[0.9rem] py-[0.35rem] font-semibold',
                          actif[item.cle] ? 'bg-mint text-cobalt' : 'bg-fog text-ink',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'size-[0.5rem] rounded-full',
                            actif[item.cle] ? 'bg-cobalt' : 'bg-muted',
                          )}
                        />
                        {actif[item.cle] ? usages.etat.actif : usages.etat.inactif}
                      </span>
                    </div>
                    <h3 className="texte-42 text-cobalt mt-[1.5rem]">{item.titre}</h3>
                    <p className="mt-[1.25rem]">{item.texte}</p>
                    <ul className="mt-auto grid gap-[0.75rem] pt-[2rem]">
                      {item.points.map((point) => (
                        <li key={point} className="flex items-start gap-[0.75rem] font-semibold">
                          <Icone
                            nom="coche"
                            className="text-flame-texte mt-[0.2rem] size-[1.1rem] shrink-0"
                          />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </article>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* QUATRE GESTES : des lignes, comme un programme */}
      <section className="bg-cream gouttiere pb-[11.25rem] max-[767px]:pb-[3.75rem]">
        <div className="conteneur">
          <Reveal>
            <h2 className="titre-84">
              {deroule.titre[0]} <Accent>{deroule.titre[1]}</Accent>
            </h2>
          </Reveal>
          <ol className="mt-[4rem] max-[767px]:mt-8">
            {deroule.etapes.map((etape, index) => (
              <li key={etape.numero} className="border-b border-[#d6dfdd]">
                <Reveal
                  delay={index * 0.08}
                  className="grid gap-4 py-[2.5rem] md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.5fr)_minmax(0,1.1fr)] md:gap-[2rem] lg:grid-cols-[31rem_14rem_1fr]"
                >
                  <h3 className="texte-42 text-cobalt">{etape.titre}</h3>
                  <p className="texte-16 md:pt-[0.6rem]">{etape.puce}</p>
                  <p className="md:pt-[0.3rem]">{etape.texte}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* JAMAIS : section rose, le mot en filigrane geant derriere les cartes */}
      <section className="bg-sun rounded-b-carte gouttiere relative z-10 overflow-hidden pt-[9.3rem] pb-[11.25rem] max-[767px]:py-[3.75rem]">
        <div className="conteneur relative">
          <Reveal>
            <h2 className="titre-84 text-cobalt text-center">
              {jamais.titre} <span className="text-ink">{jamais.mot}.</span>
            </h2>
          </Reveal>
          <div className="relative mt-[5rem] max-[767px]:mt-10">
            <ul className="relative grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-0">
              {jamais.cartes.map((carteTexte, index) => {
                const carte = cartesJamais[index % cartesJamais.length]!
                // Sur fond rose, la carte rose prend le creme pour rester lisible.
                const classe =
                  carte.classe === 'bg-sun text-cobalt' ? 'bg-cream text-cobalt' : carte.classe
                return (
                  <li key={carteTexte.label} className={carte.decalage}>
                    <Reveal
                      delay={index * 0.08}
                      tilt={carte.inclinaison}
                      className="max-[1023px]:[--reveal-tilt:0deg]!"
                    >
                      <article
                        className={cn(
                          'redresse flex min-h-[19rem] flex-col rounded-[1.5rem] p-[1.25rem] sm:min-h-[27rem] sm:p-[1.5rem] lg:-mx-[0.75rem] lg:p-[2.3rem]',
                          classe,
                        )}
                      >
                        <h3 className="texte-24">{carteTexte.label}</h3>
                        <Icone
                          nom={carte.icone}
                          className="my-auto size-[4.5rem] self-center max-[479px]:size-[3rem]"
                        />
                        <p className="texte-18 border-t border-current pt-[1.1rem] max-[479px]:text-[0.875rem]">
                          {carteTexte.texte}
                        </p>
                      </article>
                    </Reveal>
                  </li>
                )
              })}
            </ul>
          </div>
          <Reveal className="mx-auto mt-[7rem] max-w-[56rem] text-center max-[767px]:mt-14">
            <p className="texte-32">
              {jamais.conclusion[0]} {jamais.conclusion[1]}{' '}
              <span className="text-cobalt">{jamais.conclusion[2]}</span>
            </p>
            <p className="mt-[1.25rem]">{jamais.texte}</p>
          </Reveal>
        </div>
      </section>

      {/* CE QUI LE GARANTIT : titre centre, cartes a icone */}
      <section className="bg-cream gouttiere section-espace">
        <div className="conteneur">
          <Reveal className="mx-auto max-w-[56rem] text-center">
            <h2 className="titre-84">
              {garanties.titre[0]} <Accent>{garanties.titre[1]}</Accent>
            </h2>
            <p className="mt-[1.5rem]">{garanties.sousTitre}</p>
          </Reveal>
          <ul className="mt-[4rem] grid gap-[1.66rem] md:grid-cols-2 lg:grid-cols-3">
            {garantiesAffichees.map((item, index) => (
              <li key={item.cle}>
                <Reveal delay={index * 0.06} className="h-full">
                  <article className="lift bg-paper flex h-full flex-col gap-[1.5rem] rounded-[1.5rem] p-[1.75rem]">
                    <span className="bg-mint text-cobalt flex size-[3.25rem] shrink-0 items-center justify-center rounded-[0.9rem]">
                      <Icone
                        nom={ICONES_GARANTIES[item.cle] ?? 'coche'}
                        className="size-[1.6rem]"
                      />
                    </span>
                    <div>
                      <h3 className="texte-28 text-cobalt">{item.titre}</h3>
                      <p className="mt-[0.6rem]">{item.libelle}</p>
                    </div>
                  </article>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* LA SUITE : section verte, comme la fin de la page agences */}
      <section className="bg-cobalt rounded-t-carte gouttiere relative z-10 pt-[9.3rem] pb-[6.2rem] text-center text-white max-[767px]:pt-[4.8rem] max-[767px]:pb-[3rem]">
        <Reveal className="mx-auto max-w-[56rem]">
          <h2 className="titre-84">
            {suiteIa.titre[0]} <span className="text-sun">{suiteIa.titre[1]}</span>
          </h2>
          <p className="mx-auto mt-[1.5rem] max-w-[42rem]">{suiteIa.texte}</p>
          <ul className="mt-[2rem] flex flex-wrap justify-center gap-x-[2rem] gap-y-[0.5rem]">
            {suiteIa.liens.map((l) => (
              <li key={l.href}>
                <Link
                  href={lien(langue, l.href) as Route}
                  className="inline-flex min-h-[44px] items-center font-semibold underline underline-offset-4"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-[2.5rem] flex justify-center">
            <Button href={lien(langue, '/demarrer')} tone="paper">
              {suiteIa.cta}
            </Button>
          </div>
        </Reveal>
      </section>
    </main>
  )
}
