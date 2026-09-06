'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'

import { consommerDebit } from '@/lib/acces/debit'
import { clientServeur } from '@/lib/acces/serveur'
import { capaciteDepuisCookies, clientPorteurDeLien, urlDuLien } from '@/lib/acces/session'
import { signerJeton } from '@/lib/acces/jeton'
import { envoyerLienGarant } from '@/lib/courriels/liens'

/**
 * Le locataire designe son garant, et c'est tout ce qu'il ecrit.
 *
 * La base le dit deja : `porteur_lien` n'a le droit d'ecrire qu'une seule
 * colonne de `dossiers`, `email_garant`, et seulement sur son propre dossier.
 * Cette action ne fait qu'emprunter ce droit avec le jeton de la personne. Si
 * elle tentait autre chose, ce n'est pas ce code qui refuserait : c'est
 * Postgres.
 *
 * Renvoyer le lien est la meme action. `emettre_jeton` remplace le jeton
 * precedent, donc le renvoyer, c'est le revoquer : un lien transfere par
 * erreur cesse de valoir des que le locataire en demande un autre.
 */

export type EtatGarant =
  | { statut: 'inactif' }
  | { statut: 'envoye'; a: string }
  | { statut: 'erreur'; message: string; valeur?: string }

const schema = z.object({
  courriel: z
    .string()
    .trim()
    .toLowerCase()
    .min(5, "L'adresse de ton garant est requise.")
    .max(180, 'Cette adresse est trop longue.')
    .pipe(z.email('Cette adresse ne ressemble pas a une adresse e-mail.')),
})

async function empreinteAppelant(): Promise<string> {
  const entetes = await headers()
  return (
    entetes.get('x-forwarded-for')?.split(',')[0]?.trim() || entetes.get('x-real-ip') || 'inconnu'
  )
}

export async function designerMonGarant(
  _precedent: EtatGarant,
  donnees: FormData,
): Promise<EtatGarant> {
  const saisie = String(donnees.get('courriel') ?? '')
  const analyse = schema.safeParse({ courriel: saisie })

  if (!analyse.success) {
    return {
      statut: 'erreur',
      message: analyse.error.issues[0]?.message ?? 'Cette adresse est invalide.',
      valeur: saisie,
    }
  }

  const { courriel } = analyse.data

  // Sans jeton de locataire, il n'y a rien a designer. Le message est le meme
  // qu'un lien perime : la page suivante l'expliquera mieux qu'une erreur.
  const porteur = await capaciteDepuisCookies()
  if (!porteur || porteur.capacite.partie !== 'locataire') {
    return { statut: 'erreur', message: 'Ton lien a expire. Demande-en un nouveau.' }
  }

  try {
    if (!(await consommerDebit(await clientServeur(), 'lien_garant', await empreinteAppelant()))) {
      return {
        statut: 'erreur',
        message: 'Trop de liens envoyes. Reessaie dans un quart d’heure.',
        valeur: saisie,
      }
    }

    const supabase = clientPorteurDeLien(porteur.jeton)
    const { dossierId } = porteur.capacite

    // Le locataire lit son propre dossier : c'est la politique qui le lui
    // permet, et c'est aussi ce qui donne son adresse pour le courriel.
    const { data: dossier } = await supabase
      .from('dossiers')
      .select('reference, email_locataire, paye_le, agence_id, demonstration')
      .eq('id', dossierId)
      .maybeSingle()

    if (!dossier) {
      return { statut: 'erreur', message: 'Ton lien a expire. Demande-en un nouveau.' }
    }

    // La base refuserait de toute facon d'emettre le lien (migration 0018) ;
    // ici on le dit avant, avec les mots de l'ecran.
    if (!dossier.paye_le && !dossier.agence_id && !dossier.demonstration) {
      return {
        statut: 'erreur',
        message: 'Regle d abord ton dossier, plus haut : le lien de ton garant partira ensuite.',
        valeur: saisie,
      }
    }

    if (courriel === String(dossier.email_locataire).toLowerCase()) {
      return {
        statut: 'erreur',
        message: 'Ton garant ne peut pas etre toi-meme.',
        valeur: saisie,
      }
    }

    const { data: emissions, error } = await supabase.rpc('designer_garant_avec_lien', { courriel })
    const emis = Array.isArray(emissions) ? emissions[0] : null
    if (error || !emis?.jti || !emis.expire_le) {
      return {
        statut: 'erreur',
        message:
          'Un garant déjà invité ne peut pas être remplacé dans ce dossier. Tu peux lui renvoyer son lien.',
        valeur: saisie,
      }
    }
    const lien = {
      jeton: await signerJeton(dossierId, 'garant', emis.jti, new Date(emis.expire_le)),
    }

    const envoye = await envoyerLienGarant({
      a: courriel,
      url: urlDuLien(lien.jeton),
      reference: String(dossier.reference),
      demandePar: String(dossier.email_locataire),
    })

    if (!envoye) {
      return {
        statut: 'erreur',
        message: "Le lien n'a pas pu etre envoye. Verifie l'adresse et reessaie.",
        valeur: saisie,
      }
    }
  } catch {
    console.error('[locataire] designation impossible')
    return {
      statut: 'erreur',
      message:
        'Un garant déjà invité ne peut pas être remplacé dans ce dossier. Tu peux lui renvoyer son lien.',
      valeur: saisie,
    }
  }

  revalidatePath('/locataire')
  return { statut: 'envoye', a: courriel }
}
