'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as navEn from '@/lib/content/en/navigation'
import * as siteEn from '@/lib/content/en/site'
import * as navFr from '@/lib/content/navigation'
import { LANGUES, cheminDansLangue, choisir, lien, type Langue } from '@/lib/i18n'
import * as siteFr from '@/lib/site'
import { cn } from '@/lib/utils'

/** Le nom de chaque langue dans sa propre langue, pour les lecteurs d'ecran. */
const NOMS: Record<Langue, string> = { fr: 'Français', en: 'English' }

/**
 * La barre verte au-dessus de l'en-tete : a gauche les publics du site, la
 * page courante en pastille ; a droite la bascule de langue et l'acces au
 * compte agence.
 */
export function BarrePublics({ langue = 'fr' }: { langue?: Langue }) {
  const chemin = usePathname()
  const { barrePublics } = choisir(langue, navFr, navEn)
  const { chrome } = choisir(langue, siteFr, siteEn)
  return (
    <div className="bg-cobalt text-white">
      <div className="flex h-[var(--entete-barre)] items-center justify-between gap-4 px-[1.7rem] text-[1rem] max-[479px]:gap-2 max-[479px]:px-4">
        <nav aria-label={barrePublics.aria} className="flex min-w-0 items-center gap-1">
          <span className="mr-2 hidden sm:inline">{barrePublics.libelle}</span>
          {barrePublics.liens.map((entree) => {
            const href = lien(langue, entree.href)
            const actif = entree.href === '/' ? chemin === href : chemin.startsWith(href)
            return (
              <Link
                key={entree.href}
                href={href}
                aria-current={actif ? 'page' : undefined}
                className={cn(
                  "relative rounded-full px-[0.9rem] py-2 text-[1rem] leading-none whitespace-nowrap transition-colors after:absolute after:inset-x-0 after:-inset-y-[10px] after:content-[''] hover:bg-white/10 max-[479px]:px-[0.7rem] max-[479px]:text-[0.875rem]",
                  actif && 'bg-white/20 font-semibold hover:bg-white/20',
                  entree.href === '/questions' && 'hidden sm:inline',
                )}
              >
                {entree.label}
              </Link>
            )
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-[1.25rem] max-[479px]:gap-0">
          <nav aria-label={chrome.langue} className="flex items-center">
            {LANGUES.map((code) => (
              <Link
                key={code}
                href={cheminDansLangue(chemin, code)}
                hrefLang={code}
                lang={code}
                aria-current={code === langue ? 'true' : undefined}
                className={cn(
                  "relative rounded-full px-[0.6rem] py-2 text-[0.875rem] leading-none font-semibold uppercase transition-colors after:absolute after:inset-x-0 after:-inset-y-[10px] after:content-[''] hover:bg-white/10",
                  // Sur telephone, la place manque : seule l'autre langue reste.
                  code === langue
                    ? 'bg-white/20 hover:bg-white/20 max-[479px]:hidden'
                    : 'opacity-80 max-[479px]:opacity-100',
                )}
              >
                {code}
                <span className="sr-only">, {NOMS[code]}</span>
              </Link>
            ))}
          </nav>
          <Link
            href={lien(langue, barrePublics.connexion.href)}
            className="hidden whitespace-nowrap underline-offset-4 hover:underline sm:inline"
          >
            {barrePublics.connexion.label}
          </Link>
        </div>
      </div>
    </div>
  )
}
