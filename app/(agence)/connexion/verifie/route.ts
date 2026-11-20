import { NextResponse, type NextRequest } from 'next/server'

import { clientAgence } from '@/lib/acces/agence'
import { COOKIE_LANGUE, estLangue } from '@/lib/i18n'
import { optionsCookieLangue } from '@/lib/langue-espace'

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
/**
 * La langue suit le collaborateur. S'il en a deja choisi une, elle s'impose a
 * ce navigateur. Sinon celle du navigateur, choisie sur la page de connexion,
 * devient sa preference, donc la langue de ses courriels. Jamais bloquant.
 */
async function accorderLangue(
  supabase: Awaited<ReturnType<typeof clientAgence>>,
  requete: NextRequest,
  reponse: NextResponse,
) {
  try {
    const { data } = await supabase.rpc('ma_langue')
    if (estLangue(data)) {
      reponse.cookies.set(optionsCookieLangue(data))
      return
    }
    const choisie = requete.cookies.get(COOKIE_LANGUE)?.value
    if (estLangue(choisie)) await supabase.rpc('regler_ma_langue', { la_langue: choisie })
  } catch {
    // L'affichage reste celui du navigateur.
  }
}

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

  try {
    const supabase = await clientAgence()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const reponse = NextResponse.redirect(versEspace)
      await accorderLangue(supabase, requete, reponse)
      return reponse
    }
    console.error('[connexion] echange refuse')
  } catch {
    // Une panne Auth ne doit pas transmettre son erreur brute au framework.
    console.error('[connexion] echange indisponible')
  }
  versConnexion.searchParams.set('echec', 'lien')
  return NextResponse.redirect(versConnexion)
}
