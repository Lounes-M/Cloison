'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ouvrirDossierAvecLien, urlDuLien } from '@/lib/acces/session'
import { envoyerLienLocataire } from '@/lib/courriels/liens'
import { prevenirSiLeStatutAChange } from '@/lib/courriels/notifications'
import { contexteAgence } from './contexte'

/**
 * Ce que l'agence fait a un dossier.
 *
 * Ouvrir, prendre, refuser, et regler son seuil. Chaque action emprunte un
 * droit que la base accorde deja a `authenticated` sur ses propres dossiers ;
 * aucune ne verifie elle-meme que le dossier est le sien. Si elle se trompait
 * de dossier, ce n'est pas ce code qui refuserait, c'est Postgres.
 *
 * La barriere de l'ADR 0002 est dans `ouvrir_dossier` (migration 0012). On la
 * repete ici pour rendre un message propre avant l'appel, pas pour proteger :
 * la protection est en base.
 */

export type EtatNouveauDossier =
  | { statut: 'inactif' }
  | { statut: 'ouvert'; email: string }
  | { statut: 'erreur'; message: string; valeur?: string }

const schemaLocataire = z.object({
  courriel: z
    .string()
    .trim()
    .toLowerCase()
    .min(5, "L'adresse du locataire est requise.")
    .max(180, 'Cette adresse est trop longue.')
    .pipe(z.email('Cette adresse ne ressemble pas a une adresse e-mail.')),
})

const NON_VERIFIEE =
  "Votre agence n'est pas encore verifiee : l'ouverture d'un dossier pour un vrai locataire attend la verification."

export async function ouvrirUnDossier(
  _precedent: EtatNouveauDossier,
  donnees: FormData,
): Promise<EtatNouveauDossier> {
  const saisie = String(donnees.get('courriel') ?? '')
  const analyse = schemaLocataire.safeParse({ courriel: saisie })
  if (!analyse.success) {
    return {
      statut: 'erreur',
      message: analyse.error.issues[0]?.message ?? 'Adresse invalide.',
      valeur: saisie,
    }
  }

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: 'Session expiree.' }
  if (contexte.agence.statut !== 'verifiee') {
    return { statut: 'erreur', message: NON_VERIFIEE, valeur: saisie }
  }

  const { courriel } = analyse.data

  try {
    // Avec le client de l'agence, et non le client anonyme : c'est ce qui
    // rattache le dossier a l'agence, dans `ouvrir_dossier`.
    const ouvert = await ouvrirDossierAvecLien(courriel, contexte.supabase)
    if (!ouvert) {
      return {
        statut: 'erreur',
        message: "Le dossier n'a pas pu etre ouvert. Reessayez dans un instant.",
        valeur: saisie,
      }
    }

    const envoye = await envoyerLienLocataire({
      a: courriel,
      url: urlDuLien(ouvert.jeton),
      reference: ouvert.reference,
    })
    if (!envoye) {
      return {
        statut: 'erreur',
        message: "Le dossier est ouvert mais le lien n'est pas parti. Verifiez l'adresse.",
        valeur: saisie,
      }
    }
  } catch (erreur) {
    console.error('[agence] ouverture impossible', erreur)
    return {
      statut: 'erreur',
      message: "Le dossier n'a pas pu etre ouvert. Reessayez dans un instant.",
      valeur: saisie,
    }
  }

  revalidatePath('/espace')
  return { statut: 'ouvert', email: courriel }
}

export type EtatDecision = { statut: 'inactif' } | { statut: 'erreur'; message: string }

const UUID = /^[0-9a-f-]{36}$/

/**
 * Prendre un dossier : le figer pour decider dessus.
 *
 * Seulement depuis `complet`. La condition est repetee dans le `where`, si
 * bien qu'une course avec un recalcul qui viendrait de le faire tomber ne
 * prend rien : zero ligne, pas de transmission.
 */
export async function prendreLeDossier(_p: EtatDecision, donnees: FormData): Promise<EtatDecision> {
  const id = String(donnees.get('dossier') ?? '')
  if (!UUID.test(id)) return { statut: 'erreur', message: 'Dossier inconnu.' }

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: 'Session expiree.' }

  const { data, error } = await contexte.supabase
    .from('dossiers')
    .update({ statut: 'transmis' })
    .eq('id', id)
    .eq('statut', 'complet')
    .select('id')

  if (error || !Array.isArray(data) || data.length === 0) {
    if (error) console.error('[agence] prise refusee', error)
    return { statut: 'erreur', message: "Ce dossier n'est pas complet, ou n'est plus le votre." }
  }

  // La prise est un acces qui compte : elle fige ce que le garant a depose.
  const { error: journal } = await contexte.supabase.rpc('journaliser', {
    le_dossier: id,
    l_action: 'dossier_transmis',
    la_piece: null,
  })
  if (journal) console.error('[agence] prise non journalisee', journal)

  // Le locataire apprend que l'agence decide ; le garant, que sa mention
  // l'attend. Ni l'un ni l'autre ne recoit de lien : ils ont le leur.
  await prevenirSiLeStatutAChange(contexte.supabase, id, 'complet')

  revalidatePath(`/espace/dossiers/${id}`)
  revalidatePath('/espace')
  return { statut: 'inactif' }
}

export async function refuserLeDossier(_p: EtatDecision, donnees: FormData): Promise<EtatDecision> {
  const id = String(donnees.get('dossier') ?? '')
  if (!UUID.test(id)) return { statut: 'erreur', message: 'Dossier inconnu.' }

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: 'Session expiree.' }

  const { data, error } = await contexte.supabase
    .from('dossiers')
    .update({ statut: 'refuse' })
    .eq('id', id)
    .in('statut', ['complet', 'garant_insuffisant', 'transmis'])
    .select('id')

  if (error || !Array.isArray(data) || data.length === 0) {
    if (error) console.error('[agence] refus refuse', error)
    return { statut: 'erreur', message: 'Ce dossier ne peut pas etre refuse dans son etat actuel.' }
  }

  // Le refus se dit, sans son motif : c'est ce que l'ecran promet.
  await prevenirSiLeStatutAChange(contexte.supabase, id, null)

  revalidatePath(`/espace/dossiers/${id}`)
  revalidatePath('/espace')
  return { statut: 'inactif' }
}

export type EtatSeuil =
  | { statut: 'inactif' }
  | { statut: 'enregistre' }
  | { statut: 'erreur'; message: string; valeur?: string }

/**
 * Le seuil de l'agence.
 *
 * La decision de la tache 30 devient ici un curseur. Un administrateur
 * seulement : c'est la politique « Un admin decrit son agence » qui le dit,
 * et un membre qui essaierait obtiendrait zero ligne.
 */
export async function reglerLeSeuil(_p: EtatSeuil, donnees: FormData): Promise<EtatSeuil> {
  const saisie = String(donnees.get('seuil') ?? '')
    .trim()
    .replace(',', '.')
  const seuil = Number(saisie)

  if (!/^\d+(\.\d{1,2})?$/.test(saisie) || !(seuil >= 1 && seuil <= 10)) {
    return {
      statut: 'erreur',
      message: 'Le seuil se lit entre 1 et 10, avec au plus deux decimales.',
      valeur: saisie,
    }
  }

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: 'Session expiree.' }

  const { data, error } = await contexte.supabase
    .from('agences')
    .update({ seuil_ratio: seuil })
    .eq('id', contexte.agence.id)
    .select('id')

  if (error || !Array.isArray(data) || data.length === 0) {
    if (error) console.error('[agence] seuil refuse', error)
    return {
      statut: 'erreur',
      message: 'Seul un administrateur de l’agence peut modifier le seuil.',
      valeur: saisie,
    }
  }

  revalidatePath('/espace')
  return { statut: 'enregistre' }
}
