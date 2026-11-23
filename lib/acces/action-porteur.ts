'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { lien } from '@/lib/i18n'
import { langueEspace, optionsCookieLangue } from '@/lib/langue-espace'
import { langueDossier } from '@/lib/langue-preferee'
import { DUREE_JETON_SECONDES } from './jeton'
import { NOM_COOKIE_CAPACITE, resoudreCapacite } from './session'
import { NOMS_AUTRES_DOSSIERS, cookiesDesAutres, rangerLesAutres } from './trousseau'

const securise = () => process.env.NODE_ENV === 'production'

/**
 * Quitte ce navigateur. La reemission du lien reste la revocation distante.
 *
 * Les autres dossiers gardes dans le trousseau partent avec : sur un poste
 * partage, « quitter » ne doit rien laisser derriere soi.
 */
export async function quitterMonDossier(): Promise<void> {
  const langue = await langueEspace()
  const magasin = await cookies()
  magasin.set(NOM_COOKIE_CAPACITE, '', {
    path: '/',
    httpOnly: true,
    secure: securise(),
    sameSite: 'lax',
    maxAge: 0,
  })
  for (const cookie of cookiesDesAutres([], securise())) magasin.set(cookie)
  redirect(lien(langue, '/demarrer'))
}

/**
 * Rouvre un autre dossier du trousseau, et y range celui qu'on quitte.
 *
 * Le jeton choisi repasse les deux verifications avant de redevenir le cookie
 * de capacite : un lien remplace entre-temps est retire et la personne est
 * renvoyee vers la page qui lui en fait obtenir un nouveau.
 */
export async function ouvrirAutreDossier(donnees: FormData): Promise<void> {
  const place = Number(donnees.get('place'))
  const nom = Number.isInteger(place) ? NOMS_AUTRES_DOSSIERS[place] : undefined
  const magasin = await cookies()
  const jeton = nom ? magasin.get(nom)?.value : undefined
  if (!nom || !jeton) redirect(lien(await langueEspace(), '/lien-invalide'))

  const autres = NOMS_AUTRES_DOSSIERS.map((n) => (n === nom ? undefined : magasin.get(n)?.value))
  const actif = magasin.get(NOM_COOKIE_CAPACITE)?.value
  const capacite = await resoudreCapacite(jeton)
  if (!capacite) {
    const langue = await langueEspace()
    const effacement = cookiesDesAutres([], securise())[place]
    if (effacement) magasin.set(effacement)
    redirect(lien(langue, '/lien-invalide'))
  }

  // Lectures d'abord, cookies ensuite, redirect tout de suite. Un await entre
  // le set et la redirection perd la bascule : le bouton « Mon dossier de
  // locataire » semblait ne rien faire, la page du garant se reaffichant.
  const ranges = await rangerLesAutres(capacite, actif, autres)
  const langue = await langueDossier(capacite.dossierId, capacite.partie)
  magasin.set({
    name: NOM_COOKIE_CAPACITE,
    value: jeton,
    httpOnly: true,
    secure: securise(),
    sameSite: 'lax',
    path: '/',
    maxAge: DUREE_JETON_SECONDES,
  })
  for (const cookie of cookiesDesAutres(ranges, securise())) magasin.set(cookie)
  if (langue) magasin.set(optionsCookieLangue(langue))
  redirect(capacite.partie === 'locataire' ? '/locataire' : '/garant')
}
