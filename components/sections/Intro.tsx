import { Defilement } from '@/components/ui/Defilement'
import { Photo } from '@/components/ui/Photo'
import { Reveal } from '@/components/ui/Reveal'
import * as en from '@/lib/content/en/home'
import * as fr from '@/lib/content/home'
import { choisir, type Langue } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * Les photos qui passent de part et d'autre du texte. `haut` est la position
 * de depart dans la piste, en centiemes de la hauteur d'ecran : la piste monte
 * d'un ecran pendant la scene, donc une photo placee a 100 arrive tout en haut
 * a la fin. `bord` les ancre aux cotes, pour ne jamais croiser le texte.
 */
const photos = [
  { nom: 'intro-1', cote: 'gauche', bord: '3.3rem', haut: 16, penche: '-rotate-3' },
  { nom: 'intro-3', cote: 'droite', bord: '6.5rem', haut: 34, penche: 'rotate-2' },
  { nom: 'intro-2', cote: 'gauche', bord: '7.5rem', haut: 74, penche: 'rotate-2' },
  { nom: 'intro-4', cote: 'droite', bord: '2.5rem', haut: 100, penche: '-rotate-2' },
  { nom: 'intro-5', cote: 'gauche', bord: '2.5rem', haut: 128, penche: '-rotate-2' },
  { nom: 'intro-7', cote: 'droite', bord: '7rem', haut: 152, penche: 'rotate-3' },
  { nom: 'intro-6', cote: 'gauche', bord: '8rem', haut: 176, penche: 'rotate-1' },
] as const

/**
 * Section rose. Sur ordinateur, c'est une scene : la section reste epinglee a
 * l'ecran pendant que les photos montent lentement de chaque cote, puis le
 * premier texte s'efface vers le haut et le second prend sa place. Sur
 * telephone, sans JavaScript ou en mouvement reduit, les deux textes se
 * suivent simplement. Le mouvement est decrit dans `app/globals.css`
 * (`.scene-intro`), pilote par la variable `--p` de `Defilement`.
 */
export function Intro({ langue = 'fr' }: { langue?: Langue }) {
  const { problem } = choisir(langue, fr, en)
  return (
    <section className="bg-sun rounded-b-carte relative z-10 overflow-clip">
      <Defilement mode="scene" className="scene-intro">
        <div className="scene-intro__cadre">
          <div aria-hidden className="scene-intro__photos">
            <div className="scene-intro__piste">
              {photos.map((photo) => (
                <div
                  key={photo.nom}
                  className="scene-intro__photo"
                  data-cote={photo.cote}
                  style={{ '--x': photo.bord, '--y': photo.haut } as React.CSSProperties}
                >
                  <Photo
                    src={`/accueil/${photo.nom}.jpg`}
                    sizes="(min-width: 1024px) 17vw, 1px"
                    className={cn(
                      'size-full rounded-[1.5rem] shadow-[0_1.5rem_3rem_-1.5rem_rgb(0_0_0/0.35)]',
                      photo.penche,
                    )}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="scene-intro__textes gouttiere">
            <div className="scene-intro__pile">
              <div className="scene-intro__un">
                <Reveal>
                  <h2 className="titre-84 text-cobalt mx-auto max-w-[44rem]">{problem.titre}</h2>
                  <p className="texte-32 mx-auto mt-[1.5rem] max-w-[42rem]">{problem.sousTitre}</p>
                  <p className="mx-auto mt-[1rem] max-w-[40rem]">{problem.body}</p>
                </Reveal>
              </div>
              <div className="scene-intro__deux">
                <Reveal className="mx-auto max-w-[42rem]">
                  <h3 className="texte-42 text-cobalt">{problem.suite.titre}</h3>
                  <p className="texte-24 mt-[1.25rem]">{problem.suite.texte}</p>
                </Reveal>
              </div>
            </div>
          </div>
        </div>
      </Defilement>
    </section>
  )
}
