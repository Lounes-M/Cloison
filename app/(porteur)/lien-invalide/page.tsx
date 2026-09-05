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
    <div className="w-full max-w-[480px] self-center text-center">
      <h1 className="font-display text-3xl uppercase md:text-4xl">{lienInvalide.titre}</h1>
      <p className="mt-4 text-[15px] leading-relaxed font-medium">{lienInvalide.texte}</p>
      <p className="text-muted mt-6 text-[14px] font-medium">{lienInvalide.locataire}</p>
      <p className="text-muted mt-2 text-[14px] font-medium">{lienInvalide.garant}</p>
      <FormulaireContinuite mode="retrouver" />
      <div className="mt-8">
        <Button href="/demarrer">{lienInvalide.bouton}</Button>
      </div>
    </div>
  )
}
