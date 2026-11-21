'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

export type LienAgence = {
  href: Route
  libelle: string
  /** Autres chemins qui allument ce lien (les pages de reglages, par exemple). */
  aussi?: readonly string[]
}

function estCourant(chemin: string, lien: LienAgence) {
  // « Mes dossiers » couvre le tableau et les pages d'un dossier.
  if (lien.href === '/espace') return chemin === '/espace' || chemin.startsWith('/espace/dossiers')
  return [lien.href, ...(lien.aussi ?? [])].some(
    (base) => chemin === base || chemin.startsWith(`${base}/`),
  )
}

/**
 * La navigation unique de l'espace agence : toutes les destinations au meme
 * endroit, avec la page courante marquee. Sur ordinateur, une rangee ; sur
 * telephone, un menu replie sous un seul bouton, qui fonctionne sans
 * JavaScript (`<details>`) et se referme apres une navigation.
 */
export function NavigationAgence({
  liens,
  libelle,
  menu,
  children,
}: {
  liens: readonly LienAgence[]
  libelle: string
  menu: string
  /** Langue et deconnexion, rangees a la suite des liens. */
  children?: React.ReactNode
}) {
  const chemin = usePathname() ?? ''
  const repli = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if (repli.current) repli.current.open = false
  }, [chemin])

  const rangee = liens.map((lien) => (
    <Link
      key={lien.href}
      href={lien.href}
      aria-current={estCourant(chemin, lien) ? 'page' : undefined}
      className="nav-agence-lien"
    >
      {lien.libelle}
    </Link>
  ))

  return (
    <>
      <nav aria-label={libelle} className="nav-agence nav-agence-large">
        <div className="nav-agence-liens">{rangee}</div>
        <div className="nav-agence-outils">{children}</div>
      </nav>
      <details ref={repli} className="nav-agence-repli">
        <summary className="nav-agence-bouton">
          <span aria-hidden className="nav-agence-barres" />
          {menu}
        </summary>
        <nav aria-label={libelle} className="nav-agence nav-agence-panneau">
          <div className="nav-agence-liens">{rangee}</div>
          <div className="nav-agence-outils">{children}</div>
        </nav>
      </details>
    </>
  )
}
