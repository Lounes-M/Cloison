import { Fragment } from 'react'
import type { Route } from 'next'
import { Button } from '@/components/ui/Button'
import { LiveDot } from '@/components/ui/LiveDot'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { parcours } from '@/lib/content/home'
import { cn } from '@/lib/utils'

/**
 * Les deux portes d'entrée, sous un sélecteur.
 *
 * La bascule est faite de deux boutons radio et d'une règle CSS (`bascule`
 * dans `app/globals.css`) : pas de `'use client'`, donc pas de JavaScript à
 * charger, et une section qui fonctionne avant l'hydratation comme sans elle.
 * Le reste de la page est statique, celle-ci n'avait pas de raison de ne pas
 * l'être. La pilule glissante, la cascade des cartes et le trait pointillé
 * sont eux aussi entièrement déclaratifs.
 *
 * Un groupe de boutons radio plutôt qu'un jeu d'onglets ARIA : c'est
 * exactement ce que fait l'utilisateur (choisir entre deux options), et la
 * navigation au clavier vient alors du navigateur, pas d'un script.
 */

/** Une couleur par étape, dans l'ordre des trois espaces du produit. */
const TONS_PASTILLE = ['bg-sun', 'bg-mint', 'bg-sky'] as const

/** Les cartes penchent légèrement, jamais deux fois dans le même sens. */
const INCLINAISONS = ['-1deg', '0.8deg', '-0.7deg'] as const

export function Parcours() {
  return (
    <Section id="parcours" className="overflow-hidden py-20 md:py-22">
      <Reveal className="mb-9 text-center">
        <p className="bg-ink text-sun inline-block rounded-full px-5 py-2 text-[13px] font-bold tracking-[0.06em] uppercase">
          {parcours.eyebrow}
        </p>
        <h2 className="font-display mt-7 text-[clamp(2rem,5vw,46px)]">
          {parcours.headline[0]} <span className="text-cobalt">{parcours.headline[1]}</span>
        </h2>
      </Reveal>

      <div className="bascule">
        <Reveal className="mb-12 flex justify-center">
          <fieldset className="w-full max-w-[440px]">
            <legend className="sr-only">{parcours.legende}</legend>
            <div className="border-ink bg-paper shadow-brut-sm relative isolate flex rounded-full border-2 p-1.5">
              <span data-pilule aria-hidden />
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
                    className="relative z-10 w-1/2 cursor-pointer rounded-full px-3 py-2.5 text-center text-[14.5px] font-bold transition-colors"
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
            <div className="relative">
              {/* Le trait court sur toute la largeur, à hauteur des pastilles,
                  et disparaît derrière les cartes opaques : il ne se voit donc
                  que dans les deux intervalles. Masqué quand les cartes
                  s'empilent, où il ne relierait plus rien. */}
              <span
                aria-hidden
                data-connecteur
                className="absolute top-[3.15rem] left-0 hidden h-[3px] w-full md:block"
              />

              {/* L'ecart est plus large sur desktop que les autres grilles du site :
                  c'est lui qui laisse voir le connecteur. A `gap-5`, on ne
                  distingue qu'un tiret isole, qui passe pour un defaut. */}
              <ol className="relative z-10 grid gap-5 md:grid-cols-3 md:gap-9">
                {piste.etapes.map((etape, index) => (
                  <li key={etape.numero} className="h-full">
                    <div
                      data-carte
                      style={
                        {
                          '--inclinaison': INCLINAISONS[index],
                          '--retard': `${index * 0.12}s`,
                        } as React.CSSProperties
                      }
                      className="border-ink bg-paper shadow-brut-sm flex h-full flex-col rounded-[18px] border-2 p-7 transition-[box-shadow,translate] duration-150"
                    >
                      <span
                        data-pastille
                        style={{ '--retard': `${index * 0.12}s` } as React.CSSProperties}
                        className={cn(
                          'border-ink shadow-brut-xs font-display mb-4 grid size-9.5 place-items-center rounded-full border-2 text-base',
                          TONS_PASTILLE[index],
                        )}
                      >
                        {etape.numero}
                      </span>

                      <h3 className="font-display mb-2.5 text-[19px] leading-tight">
                        {etape.titre}
                      </h3>
                      <p className="text-[14.5px] leading-relaxed font-medium">{etape.texte}</p>

                      <p className="mt-auto flex items-center gap-2 pt-5 text-[12.5px] font-bold">
                        <LiveDot className="border-ink size-[9px] border-2" />
                        {etape.puce}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-12 text-center">
              <Button href={piste.cta.href as Route} tone="sun">
                {piste.cta.label} →
              </Button>

              {'note' in piste ? (
                <p className="text-muted mt-4 text-[14.5px] font-semibold">{piste.note}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}
