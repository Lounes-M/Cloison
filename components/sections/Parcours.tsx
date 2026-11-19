import type { Route } from 'next'
import { Button } from '@/components/ui/Button'
import { Reveal } from '@/components/ui/Reveal'
import { Compteur } from '@/components/ui/Compteur'
import { Photo } from '@/components/ui/Photo'
import { goToMarket, parcours } from '@/lib/content/home'

/**
 * Le parcours du locataire : le titre, les chiffres du pilote, puis une photo
 * et les trois etapes en colonne. Le parcours agence a sa propre page, vers
 * laquelle pointe le second bouton.
 */
export function Parcours() {
  const [locataire, agence] = parcours.pistes
  const [debut, ...fin] = parcours.headline[1].split(' ')
  return (
    <section id="parcours" className="bg-cream gouttiere pt-[11.25rem] max-[767px]:pt-[5rem]">
      <div className="conteneur">
        <Reveal>
          <h2 className="titre-84">
            {parcours.headline[0]}
            <br />
            <span className="text-flame-texte">{debut}</span> {fin.join(' ')}
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <dl
            aria-label={goToMarket.eyebrow}
            className="mt-[3.6rem] grid gap-[1.75rem] sm:grid-cols-3"
          >
            {goToMarket.metrics.map((metric) => (
              <div key={metric.label} className="flex flex-col-reverse">
                <dt className="texte-18 pt-[1.2rem]">{metric.label}</dt>
                <dd className="text-cobalt font-display border-b border-[#d6dfdd] pb-[1.1rem] text-[6.25rem] leading-[1.1] font-semibold max-[479px]:text-[4rem]">
                  <Compteur valeur={metric.value} />
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <div className="mt-[4.2rem] grid items-start gap-12 md:grid-cols-[25.7rem_1fr] md:gap-[16.7rem] max-[1023px]:md:gap-16">
          <Reveal variante="zoom">
            <Photo
              src="/accueil/parcours.jpg"
              sizes="(min-width: 768px) 30vw, 100vw"
              className="photo-vivante aspect-[25.7/15.5] rounded-[1.5rem] md:sticky md:top-[calc(var(--entete-total)+2rem)]"
            />
          </Reveal>
          <div>
            <ol className="space-y-[1.75rem]">
              {locataire.etapes.map((etape, index) => (
                <li key={etape.numero}>
                  <Reveal delay={index * 0.08}>
                    <h3 className="texte-42 text-cobalt">{etape.titre}</h3>
                    <p className="mt-[1.25rem]">{etape.texte}</p>
                  </Reveal>
                </li>
              ))}
            </ol>
            <div className="mt-[2.5rem] flex flex-wrap gap-3">
              <Button href={locataire.cta.href as Route} tone="paper">
                {locataire.cta.label}
              </Button>
              <Button href={agence.cta.href as Route} tone="paper">
                {agence.cta.label}
              </Button>
            </div>
            {'note' in locataire && <p className="texte-14 mt-[1.5rem]">{locataire.note}</p>}
          </div>
        </div>
      </div>
    </section>
  )
}
