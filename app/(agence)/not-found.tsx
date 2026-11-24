import { EcranIntrouvable } from '@/components/ui/EcranIntrouvable'
import { erreurs as erreursEn } from '@/lib/content/en/erreurs'
import { erreurs as erreursFr } from '@/lib/content/erreurs'
import { langueEspace, titreEspace } from '@/lib/langue-espace'

export const generateMetadata = () =>
  titreEspace(erreursFr.titreIntrouvable, erreursEn.titreIntrouvable)

/**
 * Une adresse inconnue de l'espace, ou une page refusee a ce role : le cadre
 * reste en place, avec sa navigation et la langue choisie.
 */
export default async function Introuvable() {
  return <EcranIntrouvable langue={await langueEspace()} region="div" />
}
