'use client'

import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { heroAgences as agencesFr } from '@/lib/content/agences'
import { heroAgences as agencesEn } from '@/lib/content/en/agences'
import { choisir, lien, type Langue } from '@/lib/i18n'

/** Vrai sur la page destinee aux agences, dans les deux langues. */
export function useSurPageAgences() {
  return (usePathname() ?? '').replace(/\/$/, '').endsWith('/agences')
}

/**
 * Le bouton d'appel de l'en-tete et du pied de page. Partout, il invite a
 * creer un dossier ; sur la page des agences, il mene au formulaire de
 * demonstration, parce qu'une agence ne cree pas de dossier locataire.
 */
export function AppelPrincipal({
  langue,
  libelle,
  className,
}: {
  langue: Langue
  /** Libelle par defaut, hors page agences. */
  libelle: string
  className?: string
}) {
  const surAgences = useSurPageAgences()
  const surConnexion = (usePathname() ?? '').replace(/\/$/, '').endsWith('/connexion')
  // La connexion est une page d'agence : on n'y propose pas de créer un dossier locataire.
  if (surConnexion) {
    return (
      <Button href={`${lien(langue, '/agences')}#demander`} tone="paper" className={className}>
        {choisir(langue, agencesFr, agencesEn).ancreFormulaire}
      </Button>
    )
  }
  if (surAgences) {
    return (
      <Button href="#demander" tone="paper" className={className}>
        {choisir(langue, agencesFr, agencesEn).ancreFormulaire}
      </Button>
    )
  }
  return (
    <Button href={lien(langue, '/demarrer')} tone="paper" className={className}>
      {libelle}
    </Button>
  )
}
