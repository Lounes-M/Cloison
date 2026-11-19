'use client'

import { useEffect, useRef } from 'react'

/**
 * Un chiffre qui monte de zero a sa valeur quand il entre a l'ecran.
 *
 * Le rendu serveur porte deja la valeur finale : sans JavaScript, ou avec
 * moins de mouvement demande, rien ne bouge et le chiffre est juste. Une
 * valeur qui n'est pas un entier s'affiche telle quelle.
 */
export function Compteur({ valeur, duree = 1100 }: { valeur: string; duree?: number }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    const cible = Number(valeur)
    if (!el || !/^\d+$/.test(valeur) || cible === 0) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let image = 0
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        const depart = performance.now()
        const avancer = (maintenant: number) => {
          const t = Math.min(1, (maintenant - depart) / duree)
          // Ralentit en arrivant sur la valeur.
          const progres = 1 - Math.pow(1 - t, 3)
          el.textContent = String(Math.round(cible * progres))
          if (t < 1) image = requestAnimationFrame(avancer)
        }
        image = requestAnimationFrame(avancer)
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(image)
      el.textContent = valeur
    }
  }, [valeur, duree])

  return (
    <span ref={ref} className="tabular-nums">
      {valeur}
    </span>
  )
}
