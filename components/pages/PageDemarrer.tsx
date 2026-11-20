import { FormulaireContinuite } from '@/components/forms/FormulaireContinuite'
import { FormulaireOuverture } from '@/components/forms/FormulaireOuverture'
import { Photo } from '@/components/ui/Photo'
import { Reveal } from '@/components/ui/Reveal'
import { avantOuverture as avantFr } from '@/lib/content/avant-ouverture'
import * as formulairesEn from '@/lib/content/en/formulaires'
import { marqueeItems as defilantEn } from '@/lib/content/en/home'
import { interfaceEspace as interfaceEn } from '@/lib/content/en/interface'
import { marqueeItems as defilantFr } from '@/lib/content/home'
import { interfaceEspace as interfaceFr } from '@/lib/content/interface'
import { porte as porteFr } from '@/lib/content/locataire'
import { choisir, type Langue } from '@/lib/i18n'

/**
 * La porte principale du produit.
 *
 * Dans le groupe marketing, avec son en-tete et son pied de page : la personne
 * arrive depuis la page d'accueil et n'a pas encore quitte le site public.
 * Un en-tete vert qui porte le formulaire sur une carte creme, comme l'appel a
 * candidatures de la reference, puis les trois roles en cartes.
 */
export function PageDemarrer({ langue = 'fr' }: { langue?: Langue }) {
  const interfaceEspace = choisir(langue, interfaceFr, interfaceEn)
  const marqueeItems = choisir(langue, defilantFr, defilantEn)
  const porte = choisir(langue, porteFr, formulairesEn.porte)
  const avantOuverture = choisir(langue, avantFr, formulairesEn.avantOuverture)
  const items = [...marqueeItems, ...marqueeItems, ...marqueeItems, ...marqueeItems]
  return (
    <main>
      <section
        data-premiere-section="sombre"
        className="passe-sous-entete bg-cobalt relative overflow-hidden text-white"
      >
        <div className="gouttiere relative pt-[calc(var(--entete-total)+4.5rem)] pb-[6rem] max-[767px]:pt-[calc(var(--entete-total)+1.25rem)] max-[767px]:pb-[2.5rem]">
          <div className="conteneur flex flex-col gap-[1.5rem] md:grid md:grid-cols-[1fr_32rem] md:items-start md:gap-[4rem]">
            {/* Sur mobile, le formulaire remonte juste sous le titre. */}
            <div className="max-md:contents">
              <p className="texte-14 flex items-center gap-[0.6rem] font-semibold uppercase max-md:hidden">
                <span aria-hidden className="bg-flame size-[0.6rem] rounded-full" />
                {interfaceEspace.ouverture}
              </p>
              <h1 className="titre-84 md:mt-[1rem]">{porte.titre}</h1>
              <div className="max-md:order-3">
                <p className="texte-24 max-[479px]:leading-[1.4] md:mt-[1.5rem]">
                  {porte.sousTitre}
                </p>
                <Photo
                  src="/accueil/espace-locataire.jpg"
                  sizes="(min-width: 768px) 40vw, 1px"
                  cadrage="object-[45%_40%]"
                  priority
                  className="mt-[3rem] hidden aspect-[25.7/15.5] rounded-[1.5rem] [clip-path:polygon(0_6%,100%_0,100%_100%,0_100%)] md:block"
                />
              </div>
            </div>
            <div className="espace-shell bg-cream text-ink rounded-[1.5rem] p-[2.5rem] max-[479px]:p-5 max-md:order-2">
              <p className="border-sun mb-5 border-l-4 pl-3 text-sm leading-relaxed">
                {avantOuverture}
              </p>
              <FormulaireOuverture langue={langue} />
              <details className="aide-espace mt-6">
                <summary>{interfaceEspace.retrouver}</summary>
                <FormulaireContinuite mode="retrouver" langue={langue} />
              </details>
            </div>
          </div>
        </div>
        <div
          aria-hidden
          className="bg-flame relative flex h-[3.9rem] items-center overflow-hidden whitespace-nowrap"
        >
          <div className="animate-marquee texte-16 text-ink flex w-max">
            {items.map((item, index) => (
              <span key={`${item}-${index}`} className="pr-[3rem]">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-cream gouttiere section-espace">
        <div className="conteneur">
          <Reveal>
            <h2 className="titre-84 text-center">{interfaceEspace.parcours}</h2>
          </Reveal>
          <ol className="mt-[4rem] grid gap-[1.66rem] max-[767px]:mt-8 md:grid-cols-3">
            {interfaceEspace.roles.map((role, index) => (
              <li key={role.nom}>
                <Reveal delay={index * 0.08} className="h-full">
                  <article className="lift bg-paper flex h-full min-h-[18rem] flex-col rounded-[1.5rem] p-[1.5rem] max-[767px]:min-h-0">
                    <span className="texte-16">{String(index + 1).padStart(2, '0')}</span>
                    <h3 className="texte-28 text-cobalt mt-[0.75rem]">{role.nom}</h3>
                    <p className="mt-auto pt-6">{role.texte}</p>
                  </article>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  )
}
