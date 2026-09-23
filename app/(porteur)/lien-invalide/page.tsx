import { FormulaireContinuite } from '@/components/forms/FormulaireContinuite'
import type { Metadata } from 'next'

import { Button } from '@/components/ui/Button'
import { lienInvalide } from '@/lib/content/locataire'

export const metadata: Metadata = {
  title: 'Lien expiré',
  robots: { index: false, follow: false },
}

/**
 * Un lien refuse arrive ici, quelle que soit la raison.
 *
 * Signature fausse, jeton perime, ou remplace par un plus recent : la page ne
 * dit pas lequel. Le distinguer apprendrait a qui essaie des jetons ce qui a
 * cede, et n'aiderait pas une personne de bonne foi, dont la reponse est la
 * meme dans les trois cas.
 */
export default function PageLienInvalide() {
  return (
    <div className="panneau-espace w-full max-w-[540px] self-start">
      <h1 className="font-display text-2xl uppercase md:text-3xl">{lienInvalide.titre}</h1>
      <p className="mt-4 text-[15px] leading-relaxed font-medium">{lienInvalide.texte}</p>
      <p className="text-muted mt-6 text-[14px] font-medium">{lienInvalide.locataire}</p>
      <FormulaireContinuite mode="retrouver" />
      <div className="mt-6">
        <Button href="/demarrer" tone="paper">
          {lienInvalide.bouton}
        </Button>
      </div>
      <p className="bg-sun/30 mt-6 rounded-xl p-4 text-sm leading-relaxed">{lienInvalide.garant}</p>
    </div>
  )
}
