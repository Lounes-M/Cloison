'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type RevealProps = {
  children: React.ReactNode
  className?: string
  /** Décalage en secondes, pour faire apparaître une grille en cascade. */
  delay?: number
  /** Rotation à conserver une fois l'élément révélé (cartes penchées). */
  tilt?: number
}

/**
 * Révèle son contenu quand il entre dans le viewport.
 *
 * L'état masqué et tous les filets de sécurité vivent dans la classe CSS
 * `reveal` (voir `app/globals.css`) : JavaScript ne fait qu'une chose, poser
 * `data-shown` au bon moment. Consequence : pas de `setState` dans un effet,
 * pas de rendu en cascade, et surtout aucun flash : le contenu n'est jamais
 * affiché puis rétracté à l'hydratation.
 *
 * Deux garde-fous, parce qu'une section jamais révélée serait pire qu'une
 * absence d'animation :
 *
 * 1. Un scroll rapide ou un saut d'ancre peut faire passer l'élément de
 *    « sous le viewport » à « au-dessus » entre deux échantillonnages de
 *    l'observer, sans jamais le voir intersecté, on révèle donc aussi tout
 *    ce qui est déjà passé.
 * 2. Si JavaScript ne s'exécute pas du tout, une animation CSS retardée
 *    révèle l'élément toute seule.
 */
export function Reveal({ children, className, delay = 0, tilt }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            el.dataset.shown = 'true'
            observer.disconnect()
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn('reveal', className)}
      style={
        {
          '--reveal-tilt': tilt ? `${tilt}deg` : undefined,
          '--reveal-delay': delay ? `${delay}s` : undefined,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  )
}
