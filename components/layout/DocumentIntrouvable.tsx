'use client'

import { usePathname } from 'next/navigation'

import { fontVariables } from '@/app/fonts'
import { ChromePublic } from '@/components/layout/ChromePublic'
import { EcranIntrouvable } from '@/components/ui/EcranIntrouvable'
import type { Langue } from '@/lib/i18n'

/**
 * Le document de la page 404 globale, dans la langue de la personne : celle
 * de l'adresse demandee si elle est sous `/en`, sinon celle qu'elle a choisie
 * dans son espace. `<html>` l'annonce, comme sur toute autre page.
 */
export function DocumentIntrouvable({ langueChoisie }: { langueChoisie: Langue }) {
  const chemin = usePathname()
  const langue: Langue = chemin === '/en' || chemin.startsWith('/en/') ? 'en' : langueChoisie

  return (
    <html lang={langue} className={fontVariables}>
      <body>
        <ChromePublic langue={langue}>
          <EcranIntrouvable langue={langue} />
        </ChromePublic>
      </body>
    </html>
  )
}
