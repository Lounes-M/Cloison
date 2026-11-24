import { Button } from '@/components/ui/Button'
import { NavigationReprise } from '@/components/ui/NavigationReprise'
import { erreurs as erreursEn } from '@/lib/content/en/erreurs'
import { erreurs as erreursFr } from '@/lib/content/erreurs'
import { choisir, lien, type Langue } from '@/lib/i18n'

/**
 * L'ecran 404, pose dans le cadre du groupe qui le rend : le site public ou
 * un espace connecte. La langue est celle du groupe, donc celle de `<html>`.
 *
 * `region` vaut `div` dans un espace : son cadre porte deja le `<main>`, et
 * une page n'a qu'une region principale.
 */
export function EcranIntrouvable({
  langue,
  region: Region = 'main',
}: {
  langue: Langue
  region?: 'main' | 'div'
}) {
  const erreurs = choisir(langue, erreursFr, erreursEn)

  return (
    <Region className="ecran-reprise">
      <div className="carte-reprise">
        <p className="font-display text-cobalt text-[clamp(4rem,12vw,7rem)] leading-none">404</p>
        <h1>{erreurs.titreIntrouvable}</h1>
        <p className="description-reprise">{erreurs.adresse}</p>
        <div className="actions-reprise">
          <Button href={lien(langue, '/')}>{erreurs.accueil}</Button>
        </div>
        <NavigationReprise langue={langue} />
      </div>
    </Region>
  )
}
