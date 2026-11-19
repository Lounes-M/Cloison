import { Fragment } from 'react'
import { Icone } from '@/components/ui/Icone'
import { Reveal } from '@/components/ui/Reveal'
import { product, spaces, productViews } from '@/lib/content/home'

/** Une seule scene, trois perspectives. Les radios restent utilisables sans JavaScript. */
export function Product() {
  return (
    <section id="produit" className="bg-cream gouttiere section-espace">
      <div className="conteneur">
        <Reveal className="mb-[4.5rem] grid items-start gap-8 max-[767px]:mb-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_39.4rem]">
          <h2 className="titre-84">
            {product.headline[0]}
            <br />
            <span className="text-cobalt">{product.headline[1]}</span>
          </h2>
          <p>{product.intro}</p>
        </Reveal>
        <div className="vues-produit">
          <fieldset className="min-w-0">
            <legend className="texte-16 mb-[1rem] font-semibold">{productViews.choisir}</legend>
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
                      <span className="texte-28 block">{space.title}</span>
                      <span className="texte-16 mt-1 hidden sm:block">
                        {productViews.roles[index]}
                      </span>
                    </span>
                    <span className="vue-produit-fleche" aria-hidden>
                      <Icone nom="direction" />
                    </span>
                  </label>
                </Fragment>
              ))}
            </div>
            <p className="texte-16 mt-[1.5rem] hidden max-w-[24rem] md:block">
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
                      <h3 className="texte-42 text-cobalt mt-[1rem] max-w-[28rem]">{vue.titre}</h3>
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
        <p className="texte-14 mt-[2.5rem] max-w-[56rem]">
          {product.outro} <span className="font-semibold">{product.outroHighlight}</span>
        </p>
      </div>
    </section>
  )
}
