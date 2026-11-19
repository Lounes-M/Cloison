'use client'

import { useEffect, useRef } from 'react'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/Button'
import { BarrePublics } from '@/components/layout/BarrePublics'
import { MenuMobile } from '@/components/layout/MenuMobile'
import * as navEn from '@/lib/content/en/navigation'
import * as siteEn from '@/lib/content/en/site'
import * as navFr from '@/lib/content/navigation'
import { choisir, lien, type Langue } from '@/lib/i18n'
import * as siteFr from '@/lib/site'

/**
 * En-tete du site public, pose par-dessus la premiere section.
 *
 * Transparent tant que la page n'a pas defile, puis sur fond creme. Le seul
 * JavaScript pose `data-defile` ; la couleur du logo au repos se regle en CSS
 * selon la premiere section de la page (voir `.entete` dans globals.css).
 */
export function SiteHeader({ langue = 'fr' }: { langue?: Langue }) {
  const { barrePublics } = choisir(langue, navFr, navEn)
  const { navLinks, chrome } = choisir(langue, siteFr, siteEn)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const entete = ref.current
    if (!entete) return
    const suivre = () => {
      entete.dataset.defile = window.scrollY > 24 ? 'true' : 'false'
    }
    suivre()
    window.addEventListener('scroll', suivre, { passive: true })
    return () => window.removeEventListener('scroll', suivre)
  }, [])

  return (
    <header ref={ref} className="entete fixed inset-x-0 top-0 z-50">
      <BarrePublics langue={langue} />
      <div className="entete-fond">
        <nav
          aria-label={chrome.navigationPrincipale}
          className="gouttiere relative flex h-[var(--entete-nav)] items-center justify-between gap-3"
        >
          <Logo langue={langue} className="entete-logo text-[1.6rem] max-[479px]:text-[1.4rem]" />

          <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-[0.375rem] lg:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={lien(langue, link.href)}
                className="bg-paper text-ink hover:text-cobalt rounded-brut inline-flex items-center p-[0.625rem] text-[0.875rem] leading-[1.4] font-semibold uppercase transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button href={lien(langue, '/demarrer')} tone="paper" className="hidden sm:inline-flex">
              {barrePublics.cta}
            </Button>
            <MenuMobile langue={langue} />
          </div>
        </nav>
      </div>
    </header>
  )
}
