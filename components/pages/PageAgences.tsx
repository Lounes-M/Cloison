import { FormulaireAgence } from '@/components/forms/FormulaireAgence'
import { Button } from '@/components/ui/Button'
import { Compteur } from '@/components/ui/Compteur'
import { Accent, EnTetePage } from '@/components/ui/EnTetePage'
import { Icone, type NomIcone } from '@/components/ui/Icone'
import { Photo } from '@/components/ui/Photo'
import { Reveal } from '@/components/ui/Reveal'
import * as fr from '@/lib/content/agences'
import * as en from '@/lib/content/en/agences'
import { choisir, type Langue } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Les photos qui flottent dans la section rose, en rem comme la reference. */
const photosRoses = [
  { nom: 'intro-3', classe: 'left-[2rem] top-[6rem] -rotate-3' },
  { nom: 'intro-6', classe: 'left-[5rem] top-[42rem] rotate-2' },
  { nom: 'intro-1', classe: 'right-[3rem] top-[12rem] rotate-3' },
  { nom: 'intro-4', classe: 'right-[2rem] top-[48rem] -rotate-2' },
] as const

/** Une icone par ligne du tarif. */
const ICONES_TARIF: NomIcone[] = ['fichier', 'acte', 'coche', 'cadenas']

export function PageAgences({ langue = 'fr' }: { langue?: Langue }) {
  const { cequonapporte, commentCaMarche, douleurs, formulaire, heroAgences, tarifAgence } =
    choisir(langue, fr, en)
  const [lienDebut, ...lienFin] = commentCaMarche.titre[1].split(' ')
  return (
    <main>
      <EnTetePage
        surtitre={heroAgences.eyebrow}
        titre={
          <>
            {heroAgences.titre[0]} <Accent>{heroAgences.titre[1]}</Accent> {heroAgences.titre[2]}
          </>
        }
        sousTitre={<p>{heroAgences.sousTitre}</p>}
        visuel={
          <Photo
            src="/accueil/espace-agence.jpg"
            sizes="(min-width: 768px) 85rem, 100vw"
            cadrage="object-[70%_40%]"
            priority
            className="h-[41rem] rounded-[1.5rem] max-[479px]:h-[16rem]"
          />
        }
      >
        <div className="flex justify-center">
          <Button href="#demander" tone="paper">
            {heroAgences.ancreFormulaire}
          </Button>
        </div>
      </EnTetePage>

      {/* CE QUE ÇA COÛTE AUJOURD'HUI : trois cartes blanches numerotees */}
      <section className="bg-cream gouttiere pt-[6.9rem] pb-[11.25rem] max-[767px]:py-[3.75rem]">
        <div className="conteneur">
          <Reveal>
            <h2 className="titre-84 text-center">
              {douleurs.titre[0]} <Accent>{douleurs.titre[1]}</Accent>
            </h2>
          </Reveal>
          <ul className="mt-[5.7rem] grid gap-[1.66rem] max-[767px]:mt-10 md:grid-cols-3">
            {douleurs.items.map((item, index) => (
              <li key={item.titre}>
                <Reveal delay={index * 0.08} className="h-full">
                  <article className="lift bg-paper flex h-full min-h-[21.5rem] flex-col rounded-[1.5rem] p-[1.5rem] max-[767px]:min-h-0">
                    <span className="texte-16 tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 className="texte-28 mt-[1rem]">{item.titre}</h3>
                    <p className="mt-auto pt-6">{item.texte}</p>
                  </article>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* TROIS ÉTAPES : des lignes, comme un programme */}
      <section className="bg-cream gouttiere pb-[11.25rem] max-[767px]:pb-[3.75rem]">
        <div className="conteneur">
          <Reveal>
            <h2 className="titre-84">
              {commentCaMarche.titre[0]} <Accent>{lienDebut}</Accent> {lienFin.join(' ')}
            </h2>
          </Reveal>
          <ol className="mt-[4rem] max-[767px]:mt-8">
            {commentCaMarche.etapes.map((etape, index) => (
              <li key={etape.numero} className="border-b border-[#d6dfdd]">
                <Reveal
                  delay={index * 0.08}
                  className="grid gap-4 py-[2.5rem] md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.5fr)_minmax(0,1.1fr)] md:gap-[2rem] lg:grid-cols-[31rem_14rem_1fr]"
                >
                  <h3 className="texte-42 text-cobalt">{etape.titre}</h3>
                  <p className="texte-16 md:pt-[0.6rem]">{etape.puce}</p>
                  <p className="md:pt-[0.3rem]">{etape.texte}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* UN LIEN : section rose, titre au centre et photos qui flottent */}
      <section className="bg-sun rounded-b-carte relative overflow-clip">
        <div className="relative mx-auto max-w-[95rem] md:min-h-[72rem]">
          {photosRoses.map((photo) => (
            <Photo
              key={photo.nom}
              src={`/accueil/${photo.nom}.jpg`}
              sizes="(min-width: 1024px) 17vw, 1px"
              className={cn(
                'absolute hidden h-[16.25rem] w-[16.4rem] rounded-[1.5rem] lg:block',
                photo.classe,
              )}
            />
          ))}
          <div className="gouttiere relative py-[3.75rem] text-center md:pt-[9.3rem] md:pb-[9.3rem]">
            <Reveal>
              <h2 className="titre-84 text-cobalt mx-auto max-w-[58rem]">
                {cequonapporte.titre[0]} {cequonapporte.titre[1]}
              </h2>
            </Reveal>
            <ul className="mx-auto mt-[3rem] grid max-w-[42rem] gap-[2.5rem]">
              {[...cequonapporte.items, cequonapporte.garantie].map((item, index) => (
                <li key={item.titre}>
                  <Reveal delay={index * 0.06}>
                    <h3 className="texte-32">{item.titre}</h3>
                    <p className="mt-[0.75rem]">{item.texte}</p>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CE QUE ÇA VOUS COÛTE : titre centre, regle d'or, quatre cartes */}
      <section className="bg-cream gouttiere section-espace">
        <div className="conteneur">
          <Reveal className="mx-auto max-w-[56rem] text-center">
            <h2 className="titre-84">
              {tarifAgence.titre[0]} {tarifAgence.titre[1]} <Accent>{tarifAgence.titre[2]}</Accent>
            </h2>
            <p className="mt-[1.5rem]">{tarifAgence.regleOr}</p>
          </Reveal>
          <ul className="mt-[4rem] grid gap-[1.66rem] md:grid-cols-2">
            {[...tarifAgence.lignes, tarifAgence.total].map((ligne, index) => (
              <li key={ligne.libelle}>
                <Reveal delay={index * 0.06} className="h-full">
                  <article className="lift bg-paper h-full rounded-[1.5rem] p-[2rem]">
                    <Icone
                      nom={ICONES_TARIF[index % ICONES_TARIF.length]!}
                      className="size-[2rem]"
                    />
                    <p className="texte-28 text-cobalt mt-[1.5rem]">{ligne.valeur}</p>
                    <h3 className="mt-[0.75rem]">{ligne.libelle}</h3>
                  </article>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* LE PILOTE ET LE FORMULAIRE : section verte, comme l'inscription */}
      <section
        id="demander"
        className="bg-cobalt rounded-t-carte gouttiere relative z-10 pt-[11.25rem] pb-[6.2rem] text-white max-[767px]:pt-[4.8rem] max-[767px]:pb-[3rem]"
      >
        <div className="conteneur">
          <Reveal>
            <h2 className="titre-84">
              {formulaire.titre[0]}
              <br />
              <span className="text-sun">{formulaire.titre[1]}</span>
            </h2>
            <p className="mt-[1.5rem] max-w-[42rem] md:max-w-[58rem]">{formulaire.sousTitre}</p>
          </Reveal>
          <dl className="mt-[2.9rem] grid border-t border-[#4e8478] sm:grid-cols-3">
            {formulaire.metriques.map((metrique) => (
              <div
                key={metrique.libelle}
                className="flex items-baseline gap-[1rem] border-b border-[#4e8478] py-[2rem] sm:flex-col sm:gap-[0.5rem]"
              >
                <dt className="texte-18">{metrique.libelle}</dt>
                <dd className="chiffre-100 text-sun order-first">
                  <Compteur valeur={metrique.valeur} />
                </dd>
              </div>
            ))}
          </dl>
          <div className="bg-paper text-ink mx-auto mt-[5rem] max-w-[56rem] rounded-[1.5rem] p-[2.5rem] max-[479px]:p-5">
            <FormulaireAgence langue={langue} />
          </div>
        </div>
      </section>
    </main>
  )
}
