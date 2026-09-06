import 'server-only'
import { env } from '@/lib/env'

/** Meme nom par defaut que supabase-js ; ne constitue pas une preuve d identite. */
export function nomCookieSessionAgence(): string {
  return `sb-${new URL(env.supabaseUrl).hostname.split('.')[0]}-auth-token`
}

export function estCookieSessionAgence(nom: string): boolean {
  const prefixe = nomCookieSessionAgence()
  return nom === prefixe || nom.startsWith(`${prefixe}.`)
}

/** Inclut les fragments, le profil en cache et les verificateurs PKCE. */
export function estCookieAgence(nom: string): boolean {
  return estCookieSessionAgence(nom) || nom.startsWith(`${nomCookieSessionAgence()}-`)
}
