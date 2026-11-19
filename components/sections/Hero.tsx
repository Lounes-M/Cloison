import Link from 'next/link'
import { Icone } from '@/components/ui/Icone'
import { VisuelProvisoire } from '@/components/ui/VisuelProvisoire'
import { hero, marqueeItems } from '@/lib/content/home'
import { site } from '@/lib/site'

/**
 * Premiere section de l'accueil.
 *
 * Un fond sombre plein cadre, un pan creme qui descend en biais depuis le coin
 * haut droit et porte le sous-titre, puis une bande orange inclinee avec le
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
      <VisuelProvisoire
        nom="accueil-hero-video"
        fond="nuit"
        className="absolute inset-0 opacity-90"
      />

      <div className="relative">
        {/* Le pan creme : un polygone, pour garder l'angle franc a toute largeur. */}
        <div
          aria-hidden
          className="bg-cream absolute inset-0 hidden [clip-path:polygon(30%_0,100%_0,100%_46%,77%_52%)] md:block"
        />

        <div className="relative mx-auto grid max-w-[1440px] gap-10 px-4 pt-[calc(var(--entete-total)+3rem)] pb-[clamp(10rem,22vw,20rem)] md:grid-cols-[1.6fr_1fr] md:px-[5vw] md:pt-[calc(var(--entete-total)+4rem)]">
          <div className="animate-fade-up min-w-0">
            <p className="mb-5 inline-block rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium">
              {hero.eyebrow}
            </p>
            <h1 className="font-display text-[clamp(2.4rem,5.4vw,5rem)] leading-[1.08] text-balance">
              Ton garant t&apos;aide. Il ne te doit{' '}
              <span className="text-sun">ni sa fiche de paie</span>, ni une signature à
              l&apos;aveugle.
            </h1>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link
                href="/demarrer"
                className="bouton group inline-flex items-stretch gap-1 [--bouton-h:4.5rem]"
              >
                <span aria-hidden className="bouton-fleche bouton-fleche-avant bg-sun text-white">
                  <Icone nom="fleche" />
                </span>
                <span className="bg-paper text-ink rounded-brut flex items-center gap-5 px-5 py-3">
                  <span className="flex flex-col">
                    <span className="font-display text-2xl leading-none uppercase">
                      {site.name}
                    </span>
                    <span className="text-muted mt-1 text-xs">{hero.eyebrow}</span>
                  </span>
                  <span className="text-sm font-medium uppercase">{hero.primaryCta}</span>
                </span>
                <span aria-hidden className="bouton-fleche bouton-fleche-apres bg-sun text-white">
                  <Icone nom="fleche" />
                </span>
              </Link>
              <Link
                href="/agences"
                className="text-sm font-medium underline underline-offset-4 opacity-90 hover:opacity-100"
              >
                {hero.secondaryCta}
              </Link>
            </div>
          </div>

          <p className="animate-fade-up text-ink max-w-[22rem] text-base leading-relaxed [animation-delay:0.2s] max-md:text-white md:mt-4 md:text-lg">
            {hero.subtitle}
          </p>
        </div>

        {/* La bande orange : un liseré rose, puis l'aplat, puis le nom en filigrane. */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[clamp(9rem,20vw,18rem)]">
          <div className="bg-sun absolute inset-0 [clip-path:polygon(0_22%,75%_0,100%_32%,100%_100%,0_100%)]" />
          <div className="bg-flame absolute inset-0 top-[3px] overflow-hidden [clip-path:polygon(0_22%,75%_0,100%_32%,100%_100%,0_100%)]">
            <span className="font-display absolute inset-x-0 bottom-[-0.2em] text-center text-[clamp(6rem,22vw,20rem)] leading-none tracking-tight text-white/25 uppercase">
              {site.name}
            </span>
          </div>
        </div>
      </div>

      {/* Bandeau defilant : liste quadruplee, translation de -50 %, boucle continue. */}
      <div aria-hidden className="bg-cobalt relative overflow-hidden py-3 whitespace-nowrap">
        <div className="animate-marquee flex w-max text-sm font-medium md:text-base">
          {items.map((item, index) => (
            <span key={`${item}-${index}`} className="flex items-center gap-8 pr-8">
              <span className="border-y-[5px] border-r-[8px] border-y-transparent border-r-white" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
