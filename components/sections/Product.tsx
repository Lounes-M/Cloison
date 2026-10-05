import { Fragment } from 'react'
import { Icone } from '@/components/ui/Icone'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { product, spaces, productViews } from '@/lib/content/home'

/** Une seule scene, trois perspectives. Les radios restent utilisables sans JavaScript. */
export function Product() {
  return (
    <Section id="produit" className="border-ink/15 bg-paper border-y py-16 md:py-22">
      <Reveal className="mb-11 flex flex-wrap items-end justify-between gap-8">
        <h2 className="font-display text-[clamp(2rem,5vw,46px)]">
          {product.headline[0]}
          <br />
          <span className="text-cobalt">{product.headline[1]}</span>
        </h2>
        <p className="max-w-[380px] text-base leading-relaxed font-semibold">{product.intro}</p>
      </Reveal>
      <div className="vues-produit">
        <fieldset className="min-w-0">
          <legend className="text-muted mb-5 text-xs font-bold tracking-widest uppercase">
            {productViews.choisir}
          </legend>
          <div className="vues-produit-choix">
            {spaces.map((space, index) => (
              <Fragment key={space.id}>
                <input
                  type="radio"
                  name="vue-produit"
                  id={`vue-${space.id}`}
                  value={space.id}
                  defaultChecked={index === 0}
                  className="sr-only"
                  aria-controls={`apercu-${space.id}`}
                />
                <label htmlFor={`vue-${space.id}`}>
                  <span className="vue-produit-numero" aria-hidden>
                    {String(space.step).padStart(2, '0')}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-lg font-bold md:text-2xl">{space.title}</span>
                    <span className="mt-1 hidden text-sm sm:block">
                      {productViews.roles[index]}
                    </span>
                  </span>
                  <span className="vue-produit-fleche" aria-hidden>
                    ↗
                  </span>
                </label>
              </Fragment>
            ))}
          </div>
          <p className="text-muted mt-6 hidden max-w-[280px] text-sm leading-relaxed md:block">
            {productViews.separation}
          </p>
        </fieldset>
        <div className="vue-produit-scene">
          {spaces.map((space) => {
            const vue = productViews.apercus[space.id]
            return (
              <div
                key={space.id}
                id={`apercu-${space.id}`}
                data-vue-produit={space.id}
                role="region"
                aria-label={space.title}
              >
                <div className="vue-produit-fenetre">
                  <div className="vue-produit-barre">
                    <span className="inline-flex items-center gap-2">
                      <Icone nom="cadenas" />
                      {vue.espace}
                    </span>
                    <span>{productViews.exemple}</span>
                  </div>
                  <div className="vue-produit-ecran">
                    <p className="vue-produit-repere">{vue.repere}</p>
                    <h3 className="font-display mt-3 max-w-[420px] text-[clamp(1.6rem,3vw,2.3rem)] leading-tight">
                      {vue.titre}
                    </h3>
                    <dl className="vue-produit-donnees">
                      {vue.lignes.map((ligne) => (
                        <div key={ligne.label}>
                          <dt>
                            <Icone nom={space.icone} />
                            {ligne.label}
                          </dt>
                          <dd>{ligne.valeur}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="vue-produit-frontiere">
                      <Icone nom="cadenas" />
                      {vue.frontiere}
                    </p>
                  </div>
                </div>
                <p className="vue-produit-description">{space.body}</p>
              </div>
            )
          })}
        </div>
      </div>
      <p className="text-muted mt-10 max-w-[850px] text-sm leading-relaxed">
        {product.outro} <span className="text-ink font-bold">{product.outroHighlight}</span>
      </p>
    </Section>
  )
}
