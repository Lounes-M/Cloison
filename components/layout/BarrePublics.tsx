'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import { barrePublics } from '@/lib/content/navigation'
import { cn } from '@/lib/utils'

/**
 * La barre verte au-dessus de l'en-tete : a gauche les publics du site, la
 * page courante en pastille ; a droite l'acces au compte agence.
 */
export function BarrePublics() {
  const chemin = usePathname()
  return (
    <div className="bg-cobalt text-white">
      <div className="flex h-[var(--entete-barre)] items-center justify-between gap-4 px-[1.7rem] text-[0.95rem] max-[479px]:px-4">
        <nav aria-label={barrePublics.aria} className="flex min-w-0 items-center gap-1">
          <span className="mr-2 hidden sm:inline">{barrePublics.libelle}</span>
          {barrePublics.liens.map((lien) => {
            const actif = lien.href === '/' ? chemin === '/' : chemin.startsWith(lien.href)
            return (
              <Link
                key={lien.href}
                href={lien.href as Route}
                aria-current={actif ? 'page' : undefined}
                className={cn(
                  'rounded-full px-[0.9rem] py-2 text-[1rem] leading-none whitespace-nowrap transition-colors hover:bg-white/10 max-[479px]:text-[0.875rem]',
                  actif && 'bg-white/20 font-semibold hover:bg-white/20',
                  lien.href === '/questions' && 'hidden sm:inline',
                )}
              >
                {lien.label}
              </Link>
            )
          })}
        </nav>
        <Link
          href={barrePublics.connexion.href as Route}
          className="hidden shrink-0 whitespace-nowrap underline-offset-4 hover:underline sm:inline"
        >
          {barrePublics.connexion.label}
        </Link>
      </div>
    </div>
  )
}
