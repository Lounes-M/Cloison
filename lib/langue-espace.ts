import 'server-only'

import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { cache } from 'react'

import { COOKIE_LANGUE, estLangue, versLangue, type Langue } from '@/lib/i18n'

/**
 * La langue d'affichage des espaces connectes, pour la requete en cours.
 *
 * Elle vient du cookie, jamais d'un en-tete du navigateur : la personne l'a
 * choisie, ou elle lui a ete posee a partir de sa langue preferee en entrant
 * par son lien ou en se connectant. Sans cookie, le francais.
 */
export const langueEspace = cache(async (): Promise<Langue> => {
  return versLangue((await cookies()).get(COOKIE_LANGUE)?.value)
})

/** Pose le cookie de langue. Un an : c'est une preference, pas une session. */
export async function poserLangue(langue: Langue): Promise<void> {
  ;(await cookies()).set(optionsCookieLangue(langue))
}

export function optionsCookieLangue(langue: Langue) {
  return {
    name: COOKIE_LANGUE,
    value: langue,
    // Lisible par la page : ce n'est qu'une preference d'affichage, et
    // l'ecran d'erreur, rendu cote client, en a besoin.
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  }
}

/**
 * Le titre d'une page d'espace, dans la langue affichee. Jamais indexee : un
 * espace connecte n'a rien a faire dans un moteur de recherche.
 */
export async function titreEspace(fr: string, en: string): Promise<Metadata> {
  return {
    title: (await langueEspace()) === 'en' ? en : fr,
    robots: { index: false, follow: false },
  }
}

/**
 * La langue d'une action serveur. Un formulaire pose sur une page publique
 * envoie la langue de sa page dans un champ cache, parce que cette page est
 * servie statiquement et ne lit pas le cookie ; partout ailleurs, le cookie.
 */
export async function langueAction(donnees?: FormData): Promise<Langue> {
  const champ = donnees?.get('langue')
  return estLangue(champ) ? champ : langueEspace()
}
