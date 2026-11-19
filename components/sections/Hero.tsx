import Link from 'next/link'
import { Icone } from '@/components/ui/Icone'
import { VideoFond } from '@/components/ui/VideoFond'
import { hero, marqueeItems } from '@/lib/content/home'
import { site } from '@/lib/site'

/**
 * Premiere section de l'accueil.
 *
 * Un fond sombre plein cadre, un pan creme qui descend en biais depuis le
 * haut a droite et porte le sous-titre, puis une bande orange inclinee avec le
 * nom de la marque en filigrane geant. Le bandeau defilant vert ferme la
 * section. Elle passe sous l'en-tete fixe, d'ou `passe-sous-entete`.
 */
export function Hero() {
  const items = [...marqueeItems, ...marqueeItems, ...marqueeItems, ...marqueeItems]
  return (
    <section
      data-premiere-section="sombre"
      className="passe-sous-entete bg-night relative overflow-hidden text-white"
    >
      <VideoFond
        sources={{ large: '/accueil/hero-1920.mp4', reduite: '/accueil/hero-960.mp4' }}
        poster="/accueil/hero-poster.jpg"
        className="absolute inset-0 size-full opacity-45"
      />

      <div className="relative">
        <div className="gouttiere relative pt-[calc(var(--entete-barre)+11.25rem)] pb-[24rem] max-[479px]:pt-[calc(var(--entete-total)+3rem)] max-[479px]:pb-[12rem]">
          <div className="conteneur grid gap-10 lg:grid-cols-[1fr_22.2rem] lg:gap-16">
            <div className="animate-fade-up min-w-0">
              <h1 className="titre-84 max-w-[50rem]">
                Ton garant t&apos;aide. Il ne te doit{' '}
                <span className="text-sun">ni sa fiche de paie</span>, ni une signature à
                l&apos;aveugle.
              </h1>

              <div className="mt-[3rem] flex flex-wrap items-center gap-x-6 gap-y-4 max-[479px]:mt-8">
                <Link
                  href="/demarrer"
                  className="bouton group inline-flex items-stretch gap-[0.22rem] [--bouton-h:max(44px,4.5rem)]"
                >
                  <span aria-hidden className="bouton-fleche bouton-fleche-avant bg-sun text-white">
                    <Icone nom="fleche" />
                  </span>
                  <span className="bg-paper text-ink rounded-brut flex items-center gap-[1rem] py-2 pr-[1.31rem] pl-[1.31rem]">
                    <span aria-hidden className="flex flex-col">
                      <span className="texte-22 leading-[1.52]">{site.name}</span>
                      <span className="texte-12 text-ink/70 font-semibold">{hero.eyebrow}</span>
                    </span>
                    <span className="texte-14 uppercase">{hero.primaryCta}</span>
                  </span>
                  <span aria-hidden className="bouton-fleche bouton-fleche-apres bg-sun text-white">
                    <Icone nom="fleche" />
                  </span>
                </Link>
                <Link
                  href="/agences"
                  className="texte-16 lien-trace inline-flex min-h-[44px] items-center"
                >
                  {hero.secondaryCta}
                </Link>
              </div>
            </div>

            {/* Le pan creme est accroche au sous-titre, pas a la section : il
                descend du haut de l'ecran, deborde a droite, et son bord en
                biais passe toujours a gauche du texte, quelle que soit la
                largeur de la fenetre. */}
            <div className="relative lg:self-start">
              <div
                aria-hidden
                className="bg-cream entree-pan pointer-events-none absolute top-[calc(-1*(var(--entete-barre)+11.25rem))] right-[-100vw] bottom-[-8.5rem] left-[-10rem] hidden [clip-path:polygon(0_0,100%_0,100%_calc(100%-5rem),8rem_100%)] lg:block"
              />
              <p className="animate-fade-up text-ink texte-18 relative max-w-[22.2rem] leading-[1.4] [animation-delay:0.2s] max-lg:max-w-[32rem] max-lg:text-white lg:[animation-delay:0.55s]">
                {hero.subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* La bande orange : un liseré rose, puis l'aplat, puis le nom en filigrane. */}
        <div
          aria-hidden
          className="entree-hero absolute inset-x-0 bottom-0 h-[20rem] max-[479px]:h-[10rem]"
        >
          <div className="bg-sun absolute inset-0 [clip-path:polygon(0_22%,75%_0,100%_32%,100%_100%,0_100%)]" />
          <div className="bg-flame absolute inset-0 top-[3px] overflow-hidden [clip-path:polygon(0_22%,75%_0,100%_32%,100%_100%,0_100%)]">
            <span
              data-mot={site.name}
              className="font-display entree-mot absolute inset-x-0 bottom-[-0.12em] text-center text-[20rem] leading-[1.1] font-semibold tracking-[0.01em] text-white/25 uppercase before:content-[attr(data-mot)] max-[479px]:text-[7rem]"
            />
          </div>
        </div>
      </div>

      {/* Bandeau defilant : liste quadruplee, translation de -50 %, boucle continue. */}
      <div
        aria-hidden
        className="bg-cobalt relative flex h-[3.9rem] items-center overflow-hidden whitespace-nowrap"
      >
        <div className="animate-marquee texte-16 flex w-max">
          {items.map((item, index) => (
            <span key={`${item}-${index}`} className="flex items-center gap-[2rem] pr-[2rem]">
              <span className="border-y-[5px] border-r-[8px] border-y-transparent border-r-white" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
