'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type VideoFondProps = {
  /** Version large, puis version reduite pour les petits ecrans. */
  sources: { large: string; reduite: string }
  poster: string
  className?: string
}

/**
 * Video d'ambiance en boucle, muette et decorative. Si la personne a demande
 * moins de mouvement, elle reste sur sa premiere image.
 */
export function VideoFond({ sources, poster, className }: VideoFondProps) {
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const element = video.current
    if (!element) return
    const requete = window.matchMedia('(prefers-reduced-motion: reduce)')
    const appliquer = () => {
      if (requete.matches) element.pause()
      else void element.play().catch(() => {})
    }
    appliquer()
    requete.addEventListener('change', appliquer)
    return () => requete.removeEventListener('change', appliquer)
  }, [])

  return (
    <video
      ref={video}
      aria-hidden
      tabIndex={-1}
      muted
      loop
      playsInline
      preload="metadata"
      poster={poster}
      className={cn('pointer-events-none object-cover', className)}
    >
      <source src={sources.reduite} type="video/mp4" media="(max-width: 767px)" />
      <source src={sources.large} type="video/mp4" />
    </video>
  )
}
