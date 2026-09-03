import { NextResponse, type NextRequest } from 'next/server'

import { clientAgence } from '@/lib/acces/agence'

/**
 * Le retour du lien de connexion.
 *
 * Supabase renvoie ici avec un code a echanger contre une session. L'echange
 * pose les cookies, et c'est la seule etape de tout le parcours ou une session
 * nait.
 *
 * Ce que cette route ne fait PAS : rattacher le collaborateur a son agence.
 * Cela demande de savoir si le nom de l'agence est necessaire, donc parfois de
 * poser une question. Une route de redirection n'est pas l'endroit ou l'on
 * pose des questions ; `/espace` s'en charge, et il le fera aussi bien a la
 * dixieme visite qu'a la premiere.
 */
export async function GET(requete: NextRequest) {
  const url = new URL(requete.url)
  const code = url.searchParams.get('code')

  // L'origine de la requete, et non une adresse configuree : en preproduction
  // Vercel, chaque deploiement a la sienne, et rediriger vers la production
  // ferait sortir de l'apercu qu'on est en train de tester.
  const versEspace = new URL('/espace', url.origin)
  const versConnexion = new URL('/connexion', url.origin)

  if (!code) {
    versConnexion.searchParams.set('echec', 'lien')
    return NextResponse.redirect(versConnexion)
  }

  const supabase = await clientAgence()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // Un lien deja utilise ou perime arrive ici. Rien de plus n'est dit a
    // l'ecran : c'est le meme message pour les deux, et il invite simplement a
    // en redemander un.
    console.error('[connexion] echange refuse', error)
    versConnexion.searchParams.set('echec', 'lien')
    return NextResponse.redirect(versConnexion)
  }

  return NextResponse.redirect(versEspace)
}
