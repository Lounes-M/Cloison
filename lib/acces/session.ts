import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { env } from '@/lib/env'
import { DUREE_JETON, signerJeton, verifierSignature, type Capacite, type Partie } from './jeton'

/**
 * Le seul point d'entree pour resoudre « qui es-tu, sur quel dossier, avec
 * quel role ».
 *
 * Tout ce qui a besoin de savoir de quel cote de la cloison se trouve
 * l'appelant passe par ici. Un deuxieme chemin serait un deuxieme endroit ou
 * se tromper.
 */

/** Client anonyme, pour les fonctions ouvertes avant toute session. */
export function clientAnonyme() {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Client portant le jeton de capacite.
 *
 * Supabase lit le claim `role` et fait prendre a la connexion le role Postgres
 * correspondant. C'est la que la frontiere de l'ADR 0002 se materialise : une
 * politique ecrite `to authenticated` devient inatteignable, quelle que soit
 * l'erreur commise dans sa clause `using`.
 */
export function clientPorteurDeLien(jeton: string) {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jeton}` } },
  })
}

/**
 * Emet un lien pour une partie, et revoque le precedent.
 *
 * La base tire le `jti` et remplace la ligne, donc revoque, avant qu'on signe.
 * Elle borne aussi l'expiration a celle du dossier : un lien ne survit jamais
 * au dossier qu'il ouvre.
 */
export async function emettreLien(
  dossierId: string,
  partie: Partie,
): Promise<{ jeton: string; expireLe: Date } | null> {
  const supabase = clientAnonyme()

  const { data, error } = await supabase.rpc('emettre_jeton', {
    le_dossier: dossierId,
    la_partie: partie,
    duree: DUREE_JETON,
  })

  const emis = Array.isArray(data) ? data[0] : data
  if (error || !emis?.jti || !emis?.expire_le) {
    console.error('[acces] emission refusee', error)
    return null
  }

  const expireLe = new Date(emis.expire_le)
  return { jeton: await signerJeton(dossierId, partie, emis.jti, expireLe), expireLe }
}

/**
 * Resout un jeton en capacite utilisable, ou rien.
 *
 * Les deux verifications sont necessaires et aucune ne suffit :
 *
 *   1. la signature prouve que le jeton vient de nous, hors ligne ;
 *   2. le `jti` prouve qu'il n'a pas ete revoque par une reemission, ce qui
 *      demande la base.
 *
 * Le trajet reseau du second controle est le prix de la revocation. Le sauter
 * rendrait `emettre_jeton` decoratif.
 */
export async function resoudreCapacite(jeton: string | undefined): Promise<Capacite | null> {
  if (!jeton) return null

  const capacite = await verifierSignature(jeton)
  if (!capacite) return null

  const { data: actif, error } = await clientAnonyme().rpc('jeton_est_actif', {
    le_dossier: capacite.dossierId,
    la_partie: capacite.partie,
    le_jti: capacite.jti,
  })

  if (error) {
    // En cas de doute on refuse. Laisser passer parce que la base n'a pas
    // repondu reviendrait a desactiver la revocation le jour ou elle sert.
    console.error('[acces] verification impossible', error)
    return null
  }

  return actif === true ? capacite : null
}

/**
 * Ouvre un dossier et emet son premier lien, d'un seul geste.
 *
 * Une seule fonction en base (migration 0010), donc une seule transaction : un
 * dossier sans son premier lien serait un dossier que personne ne pourra
 * jamais ouvrir, et il vaut mieux qu'il n'existe pas. Le jeton est signe ici,
 * apres coup, comme pour `emettreLien` : la base tire le `jti`, nous signons.
 */
export async function ouvrirDossierAvecLien(
  emailDuLocataire: string,
): Promise<{ dossierId: string; reference: string; jeton: string; expireLe: Date } | null> {
  const { data, error } = await clientAnonyme().rpc('ouvrir_dossier_avec_lien', {
    email_du_locataire: emailDuLocataire,
    duree: DUREE_JETON,
  })

  const ouvert = Array.isArray(data) ? data[0] : data
  if (error || !ouvert?.dossier_id || !ouvert?.reference || !ouvert?.jti || !ouvert?.expire_le) {
    console.error('[acces] ouverture refusee', error)
    return null
  }

  const expireLe = new Date(ouvert.expire_le)
  return {
    dossierId: ouvert.dossier_id,
    reference: ouvert.reference,
    jeton: await signerJeton(ouvert.dossier_id, 'locataire', ouvert.jti, expireLe),
    expireLe,
  }
}

/**
 * Le cookie qui porte le jeton une fois le lien clique.
 *
 * Le jeton quitte l'URL des la premiere requete (voir `app/(porteur)/lien`),
 * et vit ensuite ici, `HttpOnly`. Le cookie n'est qu'un vehicule : la seule
 * autorite reste le jeton, verifie a chaque lecture par `resoudreCapacite`.
 */
export const NOM_COOKIE_CAPACITE = 'cloison_capacite'

/**
 * La capacite portee par la requete, ou rien.
 *
 * Verifie a chaque appel, signature et `jti`, plutot que de faire confiance a
 * la presence du cookie. Un cookie est fourni par le client ; un jeton
 * revoque par une reemission doit cesser de valoir sans attendre qu'il expire.
 */
export async function capaciteDepuisCookies(): Promise<{
  capacite: Capacite
  jeton: string
} | null> {
  const jeton = (await cookies()).get(NOM_COOKIE_CAPACITE)?.value
  if (!jeton) return null

  const capacite = await resoudreCapacite(jeton)
  return capacite ? { capacite, jeton } : null
}

/**
 * L'adresse que le courriel porte.
 *
 * `NEXT_PUBLIC_SITE_URL` est normalisee par `next.config.ts`, ou deduite du
 * domaine Vercel quand elle n'est pas posee.
 */
export function urlDuLien(jeton: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  return `${site}/lien/${jeton}`
}
