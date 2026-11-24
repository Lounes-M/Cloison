'use client'

import Image from 'next/image'
import { useEffect, useRef } from 'react'
import { mouvementEnPause, suivreMouvement } from '@/lib/mouvement'
import { cn } from '@/lib/utils'

type VideoFondProps = {
  /** Version large, puis version reduite pour les petits ecrans. */
  sources: { large: string; reduite: string }
  poster: string
  className?: string
}

/**
 * Video d'ambiance en boucle, muette et decorative. Si la personne a demande
 * moins de mouvement, elle reste sur sa premiere image ; elle se fige aussi
 * quand la personne met les animations en pause (`CommandeMouvement`).
 *
 * Elle n'est pas telechargee du tout quand le navigateur demande d'economiser
 * les donnees : l'affiche tient lieu de fond.
 */
export function VideoFond({ sources, poster, className }: VideoFondProps) {
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const element = video.current
    if (!element) return
    const requete = window.matchMedia('(prefers-reduced-motion: reduce)')
    const connexion = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    const econome = connexion?.saveData === true
    const appliquer = () => {
      if (requete.matches || econome || mouvementEnPause()) element.pause()
      else void element.play().catch(() => {})
    }
    appliquer()
    requete.addEventListener('change', appliquer)
    const arreter = suivreMouvement(appliquer)
    return () => {
      requete.removeEventListener('change', appliquer)
      arreter()
    }
  }, [])

  // L'affiche est une image optimisee (format moderne, largeur de l'ecran),
  // pas l'attribut `poster`, qui servirait le meme fichier 1920 px a un
  // telephone. La video se pose par-dessus des qu'elle a une image a montrer.
  return (
    <div aria-hidden className={cn('pointer-events-none overflow-hidden', className)}>
      <Image src={poster} alt="" fill priority sizes="100vw" className="object-cover" />
      <video
        ref={video}
        tabIndex={-1}
        muted
        loop
        playsInline
        preload="none"
        className="absolute inset-0 size-full object-cover"
      >
        <source src={sources.reduite} type="video/mp4" media="(max-width: 767px)" />
        <source src={sources.large} type="video/mp4" />
      </video>
    </div>
  )
}
