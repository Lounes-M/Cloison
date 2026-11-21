'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type DefilementProps = {
  children: React.ReactNode
  className?: string
  /**
   * `scene` : la progression va de 0 a 1 pendant que l'element, plus haut que
   * l'ecran, le traverse (son contenu collant reste en place).
   * `entree` : elle va de 0 a 1 entre le moment ou le haut de l'element touche
   * le bas de l'ecran et celui ou son bas y arrive.
   */
  mode: 'scene' | 'entree'
}

/** Part de l'ecart rattrapee a chaque image : le mouvement suit le doigt avec un leger retard. */
const RATTRAPAGE = 0.14

/**
 * Lie une animation au defilement, sans bibliotheque.
 *
 * JavaScript ne fait qu'une chose : poser la variable CSS `--p` (de 0 a 1) sur
 * l'element. Tout le mouvement est decrit en CSS a partir de cette variable
 * (voir « Site public : mouvement » dans `app/globals.css`). Sans JavaScript,
 * ou si la personne a demande moins de mouvement, `--p` n'est jamais pose et
 * la mise en page statique s'applique.
 */
export function Defilement({ children, className, mode }: DefilementProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = false
    let image = 0
    let courant: number | null = null

    const cible = () => {
      const cadre = el.getBoundingClientRect()
      const ecran = window.innerHeight
      const brut =
        mode === 'scene'
          ? -cadre.top / Math.max(1, cadre.height - ecran)
          : (ecran - cadre.top) / Math.max(1, cadre.height)
      return Math.min(1, Math.max(0, brut))
    }

    const pas = () => {
      image = 0
      const visee = cible()
      // Premiere mesure : on se cale sans glisser, pour ne rien animer au chargement.
      courant = courant === null ? visee : courant + (visee - courant) * RATTRAPAGE
      if (Math.abs(visee - courant) < 0.0005) courant = visee
      el.style.setProperty('--p', courant.toFixed(4))
      if (courant !== visee && visible) image = requestAnimationFrame(pas)
    }

    const demander = () => {
      if (mouvementReduit.matches) {
        el.style.removeProperty('--p')
        return
      }
      if (visible && !image) image = requestAnimationFrame(pas)
    }

    const observateur = new IntersectionObserver(
      (entrees) => {
        for (const entree of entrees) visible = entree.isIntersecting
        demander()
      },
      { rootMargin: '20% 0px 20% 0px' },
    )
    observateur.observe(el)
    window.addEventListener('scroll', demander, { passive: true })
    window.addEventListener('resize', demander)
    mouvementReduit.addEventListener('change', demander)

    return () => {
      observateur.disconnect()
      window.removeEventListener('scroll', demander)
      window.removeEventListener('resize', demander)
      mouvementReduit.removeEventListener('change', demander)
      if (image) cancelAnimationFrame(image)
    }
  }, [mode])

  return (
    <div ref={ref} className={cn(className)} data-defilement={mode}>
      {children}
    </div>
  )
}
