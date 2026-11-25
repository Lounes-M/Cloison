'use client'

import type { ReactNode } from 'react'

/**
 * Lien vers un bloc du dossier.
 *
 * Le `href` reste une ancre : sans JavaScript, le navigateur defile. Avec
 * JavaScript, le focus suit la cible, pour que le clavier n'y reste pas au
 * sommaire.
 */
export function LienAncre({ id, children }: { id: string; children: ReactNode }) {
  return (
    <a
      href={`#${id}`}
      onClick={() => {
        const cible = document.getElementById(id)
        if (!cible) return
        if (!cible.hasAttribute('tabindex')) cible.tabIndex = -1
        window.requestAnimationFrame(() => {
          cible.focus({ preventScroll: true })
        })
      }}
    >
      {children}
    </a>
  )
}
