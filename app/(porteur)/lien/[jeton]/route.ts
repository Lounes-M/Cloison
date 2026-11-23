import { NextResponse, type NextRequest } from 'next/server'

import { DUREE_JETON_SECONDES } from '@/lib/acces/jeton'
import { NOM_COOKIE_CAPACITE, resoudreCapacite } from '@/lib/acces/session'
import { NOMS_AUTRES_DOSSIERS, cookiesDesAutres, rangerLesAutres } from '@/lib/acces/trousseau'
import { optionsCookieLangue } from '@/lib/langue-espace'
import { langueDossier } from '@/lib/langue-preferee'

/**
 * Le lien recu par courriel atterrit ici.
 *
 * Le jeton est dans l'URL, et une URL se retrouve partout : historique du
 * navigateur, en-tete Referer, journaux d'un proxy. Cette route le deplace donc
 * aussitot dans un cookie `HttpOnly` et redirige vers une adresse propre. Apres
 * ce passage, le jeton n'est plus visible nulle part cote client.
 *
 * Le cookie porte le jeton lui-meme, pas un identifiant de session : il est
 * auto-suffisant (signe, date, revocable par son `jti`), et il n'y a donc pas
 * de table de sessions a tenir. Sa duree est celle du jeton ; le jeton reste la
 * seule autorite, le cookie n'est que son vehicule.
 */
export async function GET(
  requete: NextRequest,
  { params }: { params: Promise<{ jeton: string }> },
) {
  const { jeton } = await params
  const origine = new URL(requete.url).origin

  // Les deux verifications, signature et `jti` : un lien parfaitement signe
  // mais remplace par un plus recent doit etre refuse ici, sinon renvoyer un
  // lien ne revoquerait rien.
  const capacite = await resoudreCapacite(jeton)

  if (!capacite) {
    return NextResponse.redirect(new URL('/lien-invalide', origine))
  }

  const destination = capacite.partie === 'locataire' ? '/locataire' : '/garant'
  const reponse = NextResponse.redirect(new URL(destination, origine))

  reponse.cookies.set({
    name: NOM_COOKIE_CAPACITE,
    value: jeton,
    httpOnly: true,
    secure: origine.startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    maxAge: DUREE_JETON_SECONDES,
  })

  // Le dossier deja ouvert dans ce navigateur n'est pas perdu : son jeton
  // passe dans le trousseau, d'ou il se rouvre sans repasser par le courriel.
  const autres = await rangerLesAutres(
    capacite,
    requete.cookies.get(NOM_COOKIE_CAPACITE)?.value,
    NOMS_AUTRES_DOSSIERS.map((nom) => requete.cookies.get(nom)?.value),
  )
  for (const cookie of cookiesDesAutres(autres, origine.startsWith('https://')))
    reponse.cookies.set(cookie)

  // La langue que la personne a choisie, ou qu'on a choisie pour elle a
  // l'ouverture du dossier, la suit sur ce navigateur. Sans preference, le
  // cookie deja present reste.
  const langue = await langueDossier(capacite.dossierId, capacite.partie)
  if (langue) reponse.cookies.set(optionsCookieLangue(langue))

  return reponse
}
