'use server'

import { traducteur } from '@/lib/messages'
import { formulaireDuDossier } from '@/lib/acces/formulaire'
import { sessionPorteur as sessionPorteurFr } from '@/lib/content/session-porteur'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'

import { consommerDebit } from '@/lib/acces/debit'
import { clientServeur } from '@/lib/acces/serveur'
import { COLONNES_PAIEMENT, resteARegler } from '@/lib/locataire/paiement-requis'
import { capaciteDepuisCookies, clientPorteurDeLien, urlDuLien } from '@/lib/acces/session'
import { signerJeton } from '@/lib/acces/jeton'
import { envoyerLienGarant } from '@/lib/courriels/liens'
import { reprendreLivraisonLiens } from '@/lib/courriels/livraison-liens'
import { sessionPorteur as sessionPorteurEn } from '@/lib/content/en/session-porteur'
import { choisir, estLangue } from '@/lib/i18n'
import { reglerLangueDossier } from '@/lib/langue-preferee'
import { langueEspace } from '@/lib/langue-espace'

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
    .pipe(z.email('Cette adresse ne ressemble pas à une adresse e-mail.')),
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
  const langue = await langueEspace()
  const dire = traducteur(langue)
  const sessionPorteur = choisir(langue, sessionPorteurFr, sessionPorteurEn)

  const saisie = String(donnees.get('courriel') ?? '')
  const analyse = schema.safeParse({ courriel: saisie })

  if (!analyse.success) {
    return {
      statut: 'erreur',
      message: dire(analyse.error.issues[0]?.message ?? 'Cette adresse est invalide.'),
      valeur: saisie,
    }
  }

  const { courriel } = analyse.data

  // Sans jeton de locataire, il n'y a rien a designer. Le message est le meme
  // qu'un lien perime : la page suivante l'expliquera mieux qu'une erreur.
  const porteur = await capaciteDepuisCookies()
  if (porteur && !formulaireDuDossier(donnees, porteur.capacite.dossierId)) {
    return { statut: 'erreur', message: sessionPorteur.autreDossier }
  }
  if (!porteur || porteur.capacite.partie !== 'locataire') {
    return { statut: 'erreur', message: dire('Ton lien a expiré. Demande-en un nouveau.') }
  }

  try {
    if (!(await consommerDebit(await clientServeur(), 'lien_garant', await empreinteAppelant()))) {
      return {
        statut: 'erreur',
        message: dire('Trop de liens envoyés. Réessaie dans un quart d’heure.'),
        valeur: saisie,
      }
    }

    const supabase = clientPorteurDeLien(porteur.jeton)
    const { dossierId } = porteur.capacite

    // Le locataire lit son propre dossier : c'est la politique qui le lui
    // permet, et c'est aussi ce qui donne son adresse pour le courriel.
    const { data: dossier } = await supabase
      .from('dossiers')
      .select(`reference, email_locataire, ${COLONNES_PAIEMENT}`)
      .eq('id', dossierId)
      .maybeSingle()

    if (!dossier) {
      return { statut: 'erreur', message: dire('Ton lien a expiré. Demande-en un nouveau.') }
    }

    // La base refuserait de toute facon d'emettre le lien (migration 0018) ;
    // ici on le dit avant, avec les mots de l'ecran.
    if (resteARegler(dossier)) {
      return {
        statut: 'erreur',
        message: dire(
          'Règle d’abord ton dossier, plus haut : le lien de ton garant partira ensuite.',
        ),
        valeur: saisie,
      }
    }

    if (courriel === String(dossier.email_locataire).toLowerCase()) {
      return {
        statut: 'erreur',
        message: dire('Ton garant ne peut pas être toi-même.'),
        valeur: saisie,
      }
    }

    const { data: emissions, error } = await supabase.rpc('designer_garant_avec_lien', { courriel })
    const emis = Array.isArray(emissions) ? emissions[0] : null
    if (error || !emis?.jti || !emis.expire_le) {
      // La base distingue le garant fige (0020, 0084) d'une panne passagere.
      const fige = /ne peut pas etre remplace|Ce dossier est fige/.test(error?.message ?? '')
      if (error && !fige) console.error('[locataire] designation refusee')
      return {
        statut: 'erreur',
        message: dire(
          fige
            ? 'Ton garant a déjà commencé son dossier : son adresse ne peut plus changer. Tu peux lui renvoyer son lien.'
            : 'Le lien n’a pas pu être préparé. Réessaie dans un instant.',
        ),
        valeur: saisie,
      }
    }
    // La langue du garant, choisie par le locataire qui le connait : celle
    // de son lien et de son espace, qu'il pourra changer lui-meme.
    // Un renvoi de lien ne porte pas ce champ : le choix du garant reste.
    const langueGarant = donnees.get('langueGarant')
    if (estLangue(langueGarant)) await reglerLangueDossier(dossierId, 'garant', langueGarant)
    if (!dossier.demonstration) {
      await reprendreLivraisonLiens(dossierId)
    } else {
      const lien = {
        jeton: await signerJeton(dossierId, 'garant', emis.jti, new Date(emis.expire_le)),
      }

      const envoye = await envoyerLienGarant({
        a: courriel,
        url: urlDuLien(lien.jeton),
        reference: String(dossier.reference),
        demandePar: String(dossier.email_locataire),
        langue: estLangue(langueGarant) ? langueGarant : langue,
      })

      if (!envoye) {
        return {
          statut: 'erreur',
          message: dire("Le lien n'a pas pu être envoyé. Vérifie l'adresse et réessaie."),
          valeur: saisie,
        }
      }
    }
  } catch {
    console.error('[locataire] designation impossible')
    return {
      statut: 'erreur',
      message: dire('Le lien n’a pas pu être préparé. Réessaie dans un instant.'),
      valeur: saisie,
    }
  }

  revalidatePath('/locataire')
  return { statut: 'envoye', a: courriel }
}
