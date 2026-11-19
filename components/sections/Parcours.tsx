import type { Route } from 'next'
import { Button } from '@/components/ui/Button'
import { Reveal } from '@/components/ui/Reveal'
import { Photo } from '@/components/ui/Photo'
import { goToMarket, parcours } from '@/lib/content/home'

/**
 * Le parcours du locataire, en trois blocs, precede des chiffres du pilote.
 * Le parcours agence a sa propre page, vers laquelle pointe le second bouton.
 */
export function Parcours() {
  const [locataire, agence] = parcours.pistes
  return (
    <section id="parcours" className="bg-cream px-4 py-24 md:px-6 md:py-36">
      <div className="mx-auto max-w-[1280px]">
        <Reveal>
          <h2 className="font-display text-[clamp(2.5rem,6vw,6.5rem)] leading-[1.05]">
            {parcours.headline[0]}
            <br />
            <span className="text-flame-texte">{parcours.headline[1]}</span>
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="text-muted mt-6 max-w-[48ch] text-base leading-relaxed">
            {goToMarket.eyebrow} : {goToMarket.body}
          </p>
          <dl className="mt-14 grid gap-10 sm:grid-cols-3">
            {goToMarket.metrics.map((metric) => (
              <div key={metric.label} className="flex flex-col-reverse">
                <dt className="border-ink/15 mt-0 border-t pt-4 text-base">{metric.label}</dt>
                <dd className="font-display text-cobalt pb-4 text-[clamp(3.5rem,7vw,6.5rem)] leading-none">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <div className="mt-24 grid items-start gap-12 md:grid-cols-[1fr_1.4fr] md:gap-20">
          <Reveal>
            <Photo
              src="/accueil/parcours.jpg"
              sizes="(min-width: 768px) 40vw, 100vw"
              className="aspect-[4/3] rounded-3xl md:sticky md:top-[calc(var(--entete-total)+2rem)]"
            />
          </Reveal>
          <div>
            <p className="text-muted mb-8 text-sm font-medium tracking-[0.08em] uppercase">
              {locataire.onglet}
            </p>
            <ol className="space-y-12">
              {locataire.etapes.map((etape, index) => (
                <li key={etape.numero}>
                  <Reveal delay={index * 0.08}>
                    <h3 className="font-display text-cobalt text-2xl md:text-4xl">{etape.titre}</h3>
                    <p className="mt-4 max-w-[52ch] text-base leading-relaxed md:text-lg">
                      {etape.texte}
                    </p>
                  </Reveal>
                </li>
              ))}
            </ol>
            <div className="mt-12 flex flex-wrap gap-3">
              <Button href={locataire.cta.href as Route} tone="paper">
                {locataire.cta.label}
              </Button>
              <Button href={agence.cta.href as Route} tone="paper">
                {agence.cta.label}
              </Button>
            </div>
            {'note' in locataire && (
              <p className="text-muted mt-6 max-w-[52ch] text-sm leading-relaxed">
                {locataire.note}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
