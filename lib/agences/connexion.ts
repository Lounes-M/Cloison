'use server'

import { headers } from 'next/headers'
import { z } from 'zod'

import { clientAgence } from '@/lib/acces/agence'
import { consommerDebit } from '@/lib/acces/debit'
import { clientAnonyme } from '@/lib/acces/session'

/**
 * L'envoi du lien de connexion a un collaborateur d'agence.
 *
 * Pas de mot de passe, comme le pose l'ADR 0002 : lien magique et, plus tard,
 * OAuth. Zero ticket de reinitialisation, et surtout l'adresse est verifiee par
 * construction, ce dont le rattachement par domaine a besoin pour etre sur.
 *
 * Une propriete tient tout le reste : **la reponse est la meme, toujours**.
 * Qu'une adresse ait un compte ou non, qu'elle soit d'un domaine grand public
 * ou non, l'ecran affiche la meme phrase. Une reponse qui varierait ferait de
 * cette page un moyen de savoir qui travaille ou.
 *
 * Ce n'est pas gratuit : quelqu'un qui se trompe de domaine ne l'apprendra
 * qu'apres avoir clique sur le lien. C'est le prix, et il est assume, parce que
 * l'inverse renseigne un inconnu sans qu'il ait rien a prouver.
 */

export type EtatConnexion =
  | { statut: 'inactif' }
  | { statut: 'envoye' }
  | { statut: 'erreur'; message: string; valeur?: string }

const schema = z.object({
  courriel: z
    .string()
    .trim()
    .min(1, 'Ton adresse professionnelle est requise.')
    .max(320)
    .pipe(z.email('Cette adresse ne ressemble pas a une adresse e-mail.')),
})

/**
 * La seule phrase que cette action sait dire quand tout se passe bien.
 *
 * Ecrite une fois, utilisee partout ou l'on ne veut rien reveler : succes reel,
 * adresse inconnue, domaine refuse. Les distinguer serait un oracle.
 */
const ENVOYE = 'envoye' as const

async function empreinteAppelant(): Promise<string> {
  const entetes = await headers()
  return (
    entetes.get('x-forwarded-for')?.split(',')[0]?.trim() || entetes.get('x-real-ip') || 'inconnu'
  )
}

export async function envoyerLienDeConnexion(
  _precedent: EtatConnexion,
  donnees: FormData,
): Promise<EtatConnexion> {
  const saisie = String(donnees.get('courriel') ?? '')
  const analyse = schema.safeParse({ courriel: saisie })

  if (!analyse.success) {
    // La seule erreur qu'on affiche vraiment : une adresse mal formee ne
    // renseigne sur personne, puisqu'elle n'aurait de toute facon pas de
    // compte.
    return {
      statut: 'erreur',
      message: analyse.error.issues[0]?.message ?? 'Cette adresse est invalide.',
      valeur: saisie,
    }
  }

  const { courriel } = analyse.data

  try {
    if (!(await consommerDebit(clientAnonyme(), 'connexion_agence', await empreinteAppelant()))) {
      return {
        statut: 'erreur',
        message: 'Trop de tentatives. Reessaie dans quelques minutes.',
        valeur: saisie,
      }
    }

    const supabase = await clientAgence()
    const { error } = await supabase.auth.signInWithOtp({
      email: courriel,
      options: {
        // La creation de compte est libre : c'est la regle de l'ADR 0002. Ce
        // qui est controle n'est pas l'inscription, c'est le droit d'envoyer un
        // lien a un vrai garant. La barriere tombe la, et nulle part avant.
        shouldCreateUser: true,
        emailRedirectTo: `${adresseDuSite()}/connexion/verifie`,
      },
    })

    // Meme en cas d'erreur cote Supabase, la reponse ne change pas. Le journal
    // du serveur, lui, la garde entiere.
    if (error) console.error('[connexion] envoi refuse', error)
  } catch (erreur) {
    console.error('[connexion] envoi impossible', erreur)
  }

  return { statut: ENVOYE }
}

/**
 * L'adresse publique du site, pour le retour du lien.
 *
 * `NEXT_PUBLIC_SITE_URL` est normalisee dans `next.config.ts`, ou elle se
 * deduit du domaine Vercel quand elle n'est pas posee a la main.
 */
function adresseDuSite(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}
