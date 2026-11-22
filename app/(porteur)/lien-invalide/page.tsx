import { FormulaireContinuite } from '@/components/forms/FormulaireContinuite'
import { FormulaireRetrouverGarant } from '@/components/forms/FormulaireRetrouverGarant'

import { lienInvalide as lienInvalideFr } from '@/lib/content/locataire'
import { lienInvalide as lienInvalideEn } from '@/lib/content/en/locataire'
import { choisir } from '@/lib/i18n'
import { langueEspace, titreEspace } from '@/lib/langue-espace'
import { titres as titresEn } from '@/lib/content/en/titres'
import { titres as titresFr } from '@/lib/content/titres'

export const generateMetadata = () => titreEspace(titresFr.lienExpire, titresEn.lienExpire)

/**
 * Un lien refuse arrive ici, quelle que soit la raison.
 *
 * Signature fausse, jeton perime, ou remplace par un plus recent : la page ne
 * dit pas lequel. Le distinguer apprendrait a qui essaie des jetons ce qui a
 * cede, et n'aiderait pas une personne de bonne foi, dont la reponse est la
 * meme dans les trois cas.
 */
export default async function PageLienInvalide() {
  const langue = await langueEspace()
  const lienInvalide = choisir(langue, lienInvalideFr, lienInvalideEn)

  return (
    <div className="panneau-espace w-full max-w-[540px] self-start">
      <h1 className="font-display text-2xl md:text-3xl">{lienInvalide.titre}</h1>
      <p className="mt-4 text-[15px] leading-relaxed font-medium">{lienInvalide.texte}</p>
      <p className="text-muted mt-6 text-[14px] font-medium">{lienInvalide.locataire}</p>
      <FormulaireContinuite mode="retrouver" />
      <p className="mt-4 text-[14px] font-medium">
        <a href="/demarrer" className="lien-espace">
          {lienInvalide.bouton}
        </a>
      </p>
      <FormulaireRetrouverGarant />
      <p className="border-ink/15 text-muted mt-6 border-l-2 pl-4 text-[13px] leading-relaxed font-medium">
        {lienInvalide.garant}
      </p>
    </div>
  )
}
