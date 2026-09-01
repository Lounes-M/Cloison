'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type RevealProps = {
  children: React.ReactNode
  className?: string
  /** Décalage en secondes, pour faire apparaître une grille en cascade. */
  delay?: number
  /** Rotation à conserver une fois l'élément révélé (cartes penchées). */
  tilt?: number
}

/** Au-delà de ce délai, on révèle quoi qu'il arrive. */
const SAFETY_DELAY_MS = 4000

/**
 * Révèle son contenu quand il entre dans le viewport.
 *
 * Le contenu est rendu côté serveur puis masqué à l'hydratation seulement :
 * sans JS (ou avec `prefers-reduced-motion`), tout reste visible. Une section
 * jamais révélée serait pire qu'une absence d'animation — d'où les trois
 * filets ci-dessous.
 */
export function Reveal({ children, className, delay = 0, tilt }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    setShown(false)

    let observer: IntersectionObserver | undefined

    const reveal = () => {
      setShown(true)
      observer?.disconnect()
      clearTimeout(safety)
    }

    // Filet 1 : un scroll rapide ou un saut d'ancre peut faire passer
    // l'élément de « sous le viewport » à « au-dessus » entre deux
    // échantillonnages de l'observer, sans jamais le voir intersecté.
    // On révèle donc aussi tout ce qui est déjà passé.
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) reveal()
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(el)

    // Filet 2 : si l'observer ne se déclenche jamais, on n'a rien caché
    // durablement.
    const safety = setTimeout(reveal, SAFETY_DELAY_MS)

    return () => {
      observer?.disconnect()
      clearTimeout(safety)
    }
  }, [])

  const rotation = tilt ? `rotate(${tilt}deg)` : ''

  return (
    <div
      ref={ref}
      className={cn('transition-[opacity,transform] duration-700 ease-out', className)}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? rotation || undefined : `${rotation} translateY(30px)`.trim(),
        transitionDelay: shown && delay ? `${delay}s` : undefined,
      }}
    >
      {children}
    </div>
  )
}
