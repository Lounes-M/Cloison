import type { Metadata } from 'next'
import { FormulaireAgence } from '@/components/forms/FormulaireAgence'
import { ApercuDossier } from '@/components/sections/ApercuDossier'
import { Icone } from '@/components/ui/Icone'
import { LiveDot } from '@/components/ui/LiveDot'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import {
  cequonapporte,
  commentCaMarche,
  douleurs,
  formulaire,
  heroAgences,
  tarifAgence,
} from '@/lib/content/agences'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Agences',
  description: heroAgences.sousTitre,
  alternates: { canonical: '/agences' },
}

/** Une couleur par apport, dans l'ordre des trois espaces du produit. */
const TONS_APPORT = {
  sun: 'bg-sun',
  mint: 'bg-mint',
  sky: 'bg-sky',
} as const

export default function AgencesPage() {
  return (
    <main>
      {/* HERO : le texte a gauche, ce qu'il decrit a droite */}
      <Section
        className="pt-16 pb-20"
        innerClassName="grid grid-cols-1 items-center gap-14 md:grid-cols-[1.1fr_1fr]"
      >
        <div>
          <p className="bg-ink text-sun animate-fade-up inline-block rounded-full px-5 py-2 text-[13px] font-bold tracking-[0.08em] uppercase">
            {heroAgences.eyebrow}
          </p>
          <h1 className="font-display animate-fade-up mt-6 text-[clamp(2rem,5.5vw,56px)] leading-[1.04] uppercase [animation-delay:0.15s]">
            {heroAgences.titre[0]} <span className="text-cobalt">{heroAgences.titre[1]}</span>
            <br />
            <span className="border-ink shadow-brut-sm bg-flame text-ink mt-2 inline-block -rotate-[1.5deg] rounded-xl border-[3px] px-4">
              {heroAgences.titre[2]}
            </span>
          </h1>
          <p className="animate-fade-up mt-7 max-w-[460px] text-[17px] leading-relaxed font-medium [animation-delay:0.3s]">
            {heroAgences.sousTitre}
          </p>
          <div className="animate-fade-up mt-8 [animation-delay:0.45s]">
            <a
              href="#demander"
              className="press bg-flame outlined rounded-brut shadow-brut text-ink inline-flex items-center justify-center px-8 py-4 text-base font-bold"
            >
              {heroAgences.ancreFormulaire} →
            </a>
          </div>
        </div>

        <ApercuDossier />
      </Section>

      {/* CE QUE ÇA COÛTE AUJOURD'HUI : une liste qui se lit, pas trois cartes */}
      <Section className="border-ink bg-paper border-y-[3px] py-20">
        <Reveal>
          <h2 className="font-display text-flame mb-10 text-[15px] tracking-[0.06em] uppercase">
            {douleurs.eyebrow}
          </h2>
        </Reveal>
        <ul className="flex flex-col gap-6">
          {douleurs.items.map((item, index) => (
            <li key={item.titre}>
              <Reveal delay={index * 0.08}>
                <article className="border-ink flex flex-wrap items-start gap-x-6 gap-y-3 border-t-2 pt-6">
                  <span className="font-display text-muted text-2xl tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-[16rem] flex-1">
                    <h3 className="font-display mb-2 text-lg">{item.titre}</h3>
                    <p className="max-w-[62ch] text-[15px] leading-relaxed font-medium">
                      {item.texte}
                    </p>
                  </div>
                  {/* Le tampon nomme le coût en trois mots, pour qui parcourt
                      la page sans lire les paragraphes. */}
                  <span className="border-flame text-flame shrink-0 -rotate-2 rounded-lg border-2 px-3 py-1.5 text-[11px] font-bold tracking-[0.08em] uppercase">
                    {item.tampon}
                  </span>
                </article>
              </Reveal>
            </li>
          ))}
        </ul>
      </Section>

      {/* UN LIEN : bloc sombre, et la garantie occupe la quatrieme case */}
      <Section className="bg-ink text-cream py-20">
        <Reveal>
          <h2 className="font-display mb-12 text-[clamp(2rem,5vw,46px)]">
            {cequonapporte.titre[0]} <span className="text-sun">{cequonapporte.titre[1]}</span>
          </h2>
        </Reveal>

        {/* Les trois apports et la garantie forment une seule grille : la carte
            jaune n'est pas une note ajoutee sous la liste, c'est le quatrieme
            element, et sa couleur pleine dit qu'il ne se lit pas comme les
            autres. */}
        <ul className="grid gap-x-12 gap-y-10 md:grid-cols-2">
          {cequonapporte.items.map((item, index) => (
            <li key={item.titre}>
              <Reveal delay={index * 0.08}>
                <div className="border-cream border-t-2 pt-5">
                  <div className="mb-2.5 flex items-center gap-3">
                    <span
                      className={cn(
                        'text-ink grid size-7 shrink-0 place-items-center rounded-full',
                        TONS_APPORT[item.ton],
                      )}
                    >
                      <Icone nom="coche" className="size-4" />
                    </span>
                    <h3 className="font-display text-lg">{item.titre}</h3>
                  </div>
                  <p className="max-w-[46ch] text-[14.5px] leading-relaxed font-medium opacity-70">
                    {item.texte}
                  </p>
                </div>
              </Reveal>
            </li>
          ))}

          <li>
            <Reveal delay={0.24} tilt={-1}>
              <div className="bg-sun text-ink border-ink shadow-brut h-full rounded-[18px] border-2 px-6 py-5">
                <h3 className="font-display mb-2 text-[17px] uppercase">
                  {cequonapporte.garantie.titre}
                </h3>
                <p className="text-[14.5px] leading-relaxed font-medium">
                  {cequonapporte.garantie.texte}
                </p>
              </div>
            </Reveal>
          </li>
        </ul>
      </Section>

      {/* TROIS ÉTAPES : une descente, pas trois colonnes côte à côte */}
      <Section className="py-20">
        <Reveal>
          <h2 className="font-display mb-12 text-center text-[clamp(2rem,5vw,46px)]">
            {commentCaMarche.titre[0]}{' '}
            <span className="text-cobalt">{commentCaMarche.titre[1]}</span>
          </h2>
        </Reveal>

        <ol className="relative mx-auto max-w-[900px]">
          {/* Le fil vertical relie les trois pastilles. Masqué quand les étapes
              s'empilent en une colonne, où il ne relierait plus rien. */}
          <span
            aria-hidden
            data-fil
            className="absolute top-6 bottom-6 left-1/2 hidden w-[3px] -translate-x-1/2 bg-[repeating-linear-gradient(to_bottom,var(--color-ink)_0_10px,transparent_10px_23px)] md:block"
          />

          {commentCaMarche.etapes.map((etape, index) => {
            const aGauche = index % 2 === 0
            return (
              <li key={etape.numero} className="relative">
                <Reveal delay={index * 0.08}>
                  <div
                    className={cn(
                      'flex items-center gap-6 py-5 md:gap-10',
                      aGauche ? 'md:flex-row' : 'md:flex-row-reverse',
                    )}
                  >
                    <div
                      className={cn(
                        'flex-1',
                        aGauche ? 'md:text-right' : 'md:text-left',
                        'order-2 md:order-none',
                      )}
                    >
                      <h3 className="font-display mb-2 text-[19px] leading-tight">{etape.titre}</h3>
                      <p className="text-[15px] leading-relaxed font-medium">{etape.texte}</p>
                      <p
                        className={cn(
                          'mt-3 flex items-center gap-2 text-[12.5px] font-bold',
                          aGauche ? 'md:justify-end' : 'md:justify-start',
                        )}
                      >
                        <LiveDot className="border-ink border-2" />
                        {etape.puce}
                      </p>
                    </div>

                    <span className="bg-paper border-ink shadow-brut-xs font-display z-10 order-1 grid size-11 shrink-0 place-items-center rounded-full border-2 text-lg md:order-none">
                      {etape.numero}
                    </span>

                    {/* Colonne vide en vis-à-vis : elle tient l'alternance
                        gauche/droite sans dupliquer le contenu. */}
                    <div aria-hidden className="hidden flex-1 md:block" />
                  </div>
                </Reveal>
              </li>
            )
          })}
        </ol>
      </Section>

      {/* TARIF : un ticket de caisse, parce que la dernière ligne est un zéro */}
      <Section className="border-ink bg-paper border-t-[3px] py-20">
        <div className="mx-auto grid max-w-[1000px] items-center gap-14 md:grid-cols-[1fr_400px]">
          <Reveal>
            <h2 className="font-display text-[clamp(2rem,5vw,48px)] leading-[1.05]">
              {tarifAgence.titre[0]}
              <br />
              {tarifAgence.titre[1]} <span className="text-flame">{tarifAgence.titre[2]}</span>
            </h2>
            <div className="bg-sun border-ink shadow-brut-sm mt-7 max-w-[420px] -rotate-1 rounded-2xl border-2 px-6 py-5">
              <p className="text-[14.5px] leading-relaxed font-bold">{tarifAgence.regleOr}</p>
            </div>
          </Reveal>

          <Reveal className="relative" tilt={1}>
            <span className="bg-flame border-ink font-display text-ink absolute -top-4 right-5.5 z-10 rotate-4 rounded-full border-2 px-3.5 py-1.5 text-[11px] uppercase">
              {tarifAgence.tampon}
            </span>
            <div className="bg-cream border-ink shadow-brut rounded-t-md rounded-b-[18px] border-[2.5px] p-7">
              <div className="border-ink mb-4 border-b-2 border-dashed pb-4 text-center">
                <span className="font-display inline-flex items-center text-base">
                  CLOI
                  <span
                    aria-hidden
                    className="bg-sun border-ink mx-0.5 inline-block h-[19px] w-[5px] rotate-6 rounded-[3px] border-[1.5px]"
                  />
                  SON
                </span>
                <p className="text-muted mt-1 text-[11px] font-semibold">{tarifAgence.entete}</p>
              </div>

              <dl>
                {tarifAgence.lignes.map((ligne) => (
                  <div
                    key={ligne.libelle}
                    className="flex items-baseline justify-between py-2.5 text-[14.5px] font-semibold"
                  >
                    <dt>{ligne.libelle}</dt>
                    {/* Les pointillés conduisent l'oeil du libellé au montant,
                        comme sur un vrai ticket. */}
                    <span
                      aria-hidden
                      className="border-ink mx-2.5 flex-1 border-b-2 border-dotted"
                    />
                    <dd
                      className={cn(
                        'font-display text-base',
                        'ton' in ligne && ligne.ton === 'vert' && 'text-[#1a9e50]',
                      )}
                    >
                      {ligne.valeur}
                    </dd>
                  </div>
                ))}

                <div className="border-ink mt-3 flex items-baseline justify-between border-t-2 border-dashed pt-3.5 text-[14.5px] font-bold">
                  <dt>{tarifAgence.total.libelle}</dt>
                  <span aria-hidden className="border-ink mx-2.5 flex-1 border-b-2 border-dotted" />
                  <dd className="bg-ink text-sun font-display rounded-md px-2.5 py-0.5 text-base">
                    {tarifAgence.total.valeur}
                  </dd>
                </div>
              </dl>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* PILOTE : le bandeau qui amène au formulaire */}
      <Section
        contained={false}
        className="bg-cobalt border-ink relative overflow-hidden border-t-[3px] py-18 text-white"
      >
        <Icone
          nom="asterisque"
          className="animate-spin-slow absolute -top-8 -right-5 size-32 text-white/15"
        />
        <div className="relative mx-auto max-w-[1000px] px-6 md:px-10">
          <Reveal>
            <p className="bg-sun text-ink border-ink font-display inline-block -rotate-2 rounded-full border-2 px-4.5 py-1.5 text-xs uppercase">
              {formulaire.eyebrow}
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="mt-5 grid items-end gap-10 md:grid-cols-[1fr_auto]">
              <div>
                <h2 className="font-display text-[clamp(1.75rem,4.5vw,42px)] leading-tight">
                  {formulaire.titre}
                </h2>
                <p className="mt-4 max-w-[560px] text-base leading-relaxed font-medium opacity-95">
                  {formulaire.sousTitre}
                </p>
              </div>
              <dl className="flex gap-3">
                {formulaire.metriques.map((metrique) => (
                  <div
                    key={metrique.libelle}
                    className="rounded-xl border-[1.5px] border-white/40 bg-white/12 px-4.5 py-3.5 text-center"
                  >
                    <dt className="sr-only">{metrique.libelle}</dt>
                    <dd>
                      <span className="font-display block text-[26px]">{metrique.valeur}</span>
                      <span className="text-[11.5px] font-semibold opacity-85">
                        {metrique.libelle}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* LE FORMULAIRE, inchangé */}
      <Section id="demander" className="scroll-mt-28 py-20">
        <div className="bg-paper outlined shadow-brut-lg mx-auto max-w-[860px] rounded-[24px] p-8 md:p-12">
          <FormulaireAgence />
        </div>
      </Section>
    </main>
  )
}
