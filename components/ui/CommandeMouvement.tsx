'use client'

import { useSyncExternalStore } from 'react'

import { Icone } from '@/components/ui/Icone'
import * as siteEn from '@/lib/content/en/site'
import { choisir, type Langue } from '@/lib/i18n'
import { mouvementEnPause, reglerMouvement, suivreMouvement } from '@/lib/mouvement'
import * as siteFr from '@/lib/site'
import { cn } from '@/lib/utils'

/**
 * La commande qui arrete ce qui bouge tout seul : le bandeau defilant et la
 * video d'ambiance (WCAG 2.2.2, RGAA 13.8). Un contenu qui defile en boucle a
 * cote d'un texte a lire doit pouvoir etre fige par la personne, et le reglage
 * « moins de mouvement » du systeme ne suffit pas : tout le monde ne le
 * connait pas, et il n'est pas toujours a portee.
 *
 * `data-pause-mouvement` est le repere que cherche l'audit d'accessibilite sur
 * toute page ou quelque chose bouge en boucle.
 */
export function CommandeMouvement({ langue, className }: { langue: Langue; className?: string }) {
  const { chrome } = choisir(langue, siteFr, siteEn)
  const enPause = useSyncExternalStore(suivreMouvement, mouvementEnPause, () => false)

  return (
    <button
      type="button"
      data-pause-mouvement
      aria-pressed={enPause}
      aria-label={chrome.pauseAnimations}
      title={enPause ? chrome.relancerAnimations : chrome.pauseAnimations}
      onClick={() => reglerMouvement(!enPause)}
      className={cn(
        'commande-mouvement focus-visible:outline-sun inline-flex size-[44px] items-center justify-center',
        className,
      )}
    >
      <Icone nom={enPause ? 'lecture' : 'pause'} />
    </button>
  )
}
