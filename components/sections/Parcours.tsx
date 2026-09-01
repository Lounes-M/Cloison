import { Fragment } from 'react'
import type { Route } from 'next'
import { Button } from '@/components/ui/Button'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { parcours } from '@/lib/content/home'

/**
 * Les deux portes d'entrée, sous un sélecteur.
 *
 * La bascule est faite de deux boutons radio et d'une règle CSS (`bascule`
 * dans `app/globals.css`) : pas de `'use client'`, donc pas de JavaScript à
 * charger, et une section qui fonctionne avant l'hydratation comme sans elle.
 * Le reste de la page est statique, celle-ci n'avait pas de raison de ne pas
 * l'être.
 *
 * Un groupe de boutons radio plutôt qu'un jeu d'onglets ARIA : c'est
 * exactement ce que fait l'utilisateur — choisir entre deux options — et la
 * navigation au clavier vient alors du navigateur, pas d'un script.
 */
export function Parcours() {
  return (
    <Section id="parcours" className="py-20 md:py-22">
      <Reveal className="mb-9 text-center">
        <p className="bg-ink text-sun inline-block rounded-full px-5 py-2 text-[13px] font-bold tracking-[0.06em] uppercase">
          {parcours.eyebrow}
        </p>
        <h2 className="font-display mt-7 text-[clamp(2rem,5vw,46px)]">
          {parcours.headline[0]} <span className="text-cobalt">{parcours.headline[1]}</span>
        </h2>
      </Reveal>

      <div className="bascule">
        <Reveal className="mb-10 flex justify-center">
          <fieldset className="w-full max-w-[420px] sm:w-auto">
            <legend className="sr-only">{parcours.legende}</legend>
            <div className="border-ink bg-paper shadow-brut-sm flex w-full gap-1 rounded-full border-2 p-1.5 sm:w-auto">
              {parcours.pistes.map((piste, index) => (
                <Fragment key={piste.id}>
                  <input
                    type="radio"
                    name="parcours"
                    id={`piste-${piste.id}`}
                    data-piste={piste.id}
                    defaultChecked={index === 0}
                    className="sr-only"
                  />
                  <label
                    htmlFor={`piste-${piste.id}`}
                    data-onglet={piste.id}
                    className="flex-1 cursor-pointer rounded-full px-4 py-2.5 text-center text-sm font-bold whitespace-nowrap transition-colors sm:flex-none sm:px-5"
                  >
                    {piste.onglet}
                  </label>
                </Fragment>
              ))}
            </div>
          </fieldset>
        </Reveal>

        {parcours.pistes.map((piste) => (
          <div key={piste.id} data-panneau={piste.id}>
            <ol className="grid gap-5 md:grid-cols-3">
              {piste.etapes.map((etape, index) => (
                <li key={etape.numero}>
                  <Reveal delay={index * 0.08} className="h-full">
                    <div className="border-ink bg-paper shadow-brut-sm h-full rounded-[18px] border-2 p-7">
                      <span className="bg-cobalt font-display mb-4 grid size-10 place-items-center rounded-full text-lg text-white">
                        {etape.numero}
                      </span>
                      <h3 className="font-display mb-2.5 text-lg">{etape.titre}</h3>
                      <p className="text-[15px] leading-relaxed font-medium">{etape.texte}</p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>

            <div className="mt-9 text-center">
              {'cta' in piste ? (
                <Button href={piste.cta.href as Route} tone="paper">
                  {piste.cta.label} →
                </Button>
              ) : (
                <p className="text-muted text-[14.5px] font-semibold">{piste.note}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}
