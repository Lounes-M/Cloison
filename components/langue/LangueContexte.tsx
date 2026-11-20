'use client'

import { createContext, useContext } from 'react'

import type { Langue } from '@/lib/i18n'

const Contexte = createContext<Langue>('fr')

/**
 * La langue d'affichage, pour les composants client d'un espace connecte.
 * Le cadre de l'espace la lit une fois cote serveur et la fournit ici.
 */
export function FournisseurLangue({
  langue,
  children,
}: {
  langue: Langue
  children: React.ReactNode
}) {
  return <Contexte.Provider value={langue}>{children}</Contexte.Provider>
}

export function useLangue(): Langue {
  return useContext(Contexte)
}
