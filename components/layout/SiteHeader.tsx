'use client'

import { useEffect, useRef } from 'react'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/Button'
import { BarrePublics } from '@/components/layout/BarrePublics'
import { MenuMobile } from '@/components/layout/MenuMobile'
import { barrePublics } from '@/lib/content/navigation'
import { navLinks } from '@/lib/site'

/**
 * En-tete du site public, pose par-dessus la premiere section.
 *
 * Transparent tant que la page n'a pas defile, puis sur fond creme. Le seul
 * JavaScript pose `data-defile` ; la couleur du logo au repos se regle en CSS
 * selon la premiere section de la page (voir `.entete` dans globals.css).
 */
export function SiteHeader() {
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
      <BarrePublics />
      <div className="entete-fond">
        <nav
          aria-label="Navigation principale"
          className="relative mx-auto flex h-[var(--entete-nav)] max-w-[1440px] items-center justify-between gap-3 px-4 md:px-6"
        >
          <Logo className="entete-logo text-lg md:text-xl" />

          <div className="hidden items-center gap-2 lg:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="bg-paper text-ink hover:text-cobalt rounded-brut inline-flex min-h-11 items-center px-3 text-[13px] font-semibold tracking-[0.02em] uppercase transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button href="/demarrer" tone="paper" size="sm" className="hidden sm:inline-flex">
              {barrePublics.cta}
            </Button>
            <MenuMobile />
          </div>
        </nav>
      </div>
    </header>
  )
}
