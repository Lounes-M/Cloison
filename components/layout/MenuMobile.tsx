'use client'

import { useRef } from 'react'
import { useSurPageAgences } from '@/components/layout/AppelPrincipal'
import { heroAgences as agencesFr } from '@/lib/content/agences'
import { heroAgences as agencesEn } from '@/lib/content/en/agences'
import * as navEn from '@/lib/content/en/navigation'
import * as siteEn from '@/lib/content/en/site'
import * as navFr from '@/lib/content/navigation'
import { choisir, lien, type Langue } from '@/lib/i18n'
import * as siteFr from '@/lib/site'

export function MenuMobile({ langue = 'fr' }: { langue?: Langue }) {
  const { barrePublics, navigationMobile } = choisir(langue, navFr, navEn)
  const { navLinks } = choisir(langue, siteFr, siteEn)
  const menu = useRef<HTMLDetailsElement>(null)
  const surAgences = useSurPageAgences()
  const fermer = () => {
    if (menu.current) menu.current.open = false
  }
  return (
    <details
      ref={menu}
      className="lg:hidden"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && menu.current?.open) {
          menu.current.open = false
          menu.current.querySelector('summary')?.focus()
          event.preventDefault()
        }
      }}
    >
      <summary className="bg-paper text-ink rounded-brut flex min-h-[44px] cursor-pointer items-center px-4 text-[0.875rem] font-semibold tracking-[0.02em] uppercase">
        {navigationMobile.menu}
      </summary>
      <div className="bg-paper rounded-brut-lg shadow-brut-lg absolute top-full right-4 left-4 mt-2 grid max-h-[70dvh] gap-1 overflow-y-auto p-3">
        {navLinks.map((link) => (
          <a
            key={link.href}
            href={lien(langue, link.href)}
            onClick={fermer}
            className="hover:bg-cream rounded-brut flex min-h-[44px] items-center px-4 py-3 text-[0.875rem] font-semibold tracking-[0.02em] uppercase"
          >
            {link.label}
          </a>
        ))}
        <a
          href={surAgences ? '#demander' : lien(langue, '/demarrer')}
          onClick={fermer}
          className="bg-cobalt rounded-brut mt-2 flex min-h-[44px] items-center px-4 py-3 text-[1rem] font-semibold text-white"
        >
          {surAgences ? choisir(langue, agencesFr, agencesEn).ancreFormulaire : barrePublics.cta}
        </a>
      </div>
    </details>
  )
}
