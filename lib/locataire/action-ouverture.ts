'use server'

import { headers } from 'next/headers'
import { z } from 'zod'

import { consommerDebit } from '@/lib/acces/debit'
import { clientServeur } from '@/lib/acces/serveur'
import { ouvrirDossierAvecLien } from '@/lib/acces/session'
import { reprendreLivraisonLiens } from '@/lib/courriels/livraison-liens'

/**
 * La porte principale du produit : une adresse, un dossier, un lien.
 *
 * Pas de compte, comme la page d'accueil le promet. Ce qui autorise ensuite,
 * c'est le jeton dans le lien, jamais l'adresse : elle n'est qu'un canal de
 * livraison (ADR 0006).
 *
 * Contrairement a la connexion agence, cette action peut dire la verite sur
 * ses echecs. Il n'y a pas d'existence a cacher : chaque envoi valide cree un
 * dossier neuf, donc la reponse ne renseigne sur personne.
 */

export type EtatOuverture =
  | { statut: 'inactif' }
  | { statut: 'envoye' }
  | { statut: 'erreur'; message: string; valeur?: string }

const schema = z.object({
  courriel: z
    .string()
    .trim()
    .toLowerCase()
    .min(5, 'Ton adresse e-mail est requise.')
    .max(180, 'Cette adresse est trop longue.')
    .pipe(z.email('Cette adresse ne ressemble pas a une adresse e-mail.')),
})

async function empreinteAppelant(): Promise<string> {
  const entetes = await headers()
  return (
    entetes.get('x-forwarded-for')?.split(',')[0]?.trim() || entetes.get('x-real-ip') || 'inconnu'
  )
}

export async function ouvrirMonDossier(
  _precedent: EtatOuverture,
  donnees: FormData,
): Promise<EtatOuverture> {
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

  try {
    if (
      !(await consommerDebit(await clientServeur(), 'ouverture_dossier', await empreinteAppelant()))
    ) {
      return {
        statut: 'erreur',
        message: 'Trop de dossiers ouverts depuis cette connexion. Reessaie dans une heure.',
        valeur: saisie,
      }
    }

    const ouvert = await ouvrirDossierAvecLien(courriel)
    if (!ouvert) {
      return {
        statut: 'erreur',
        message: "Le dossier n'a pas pu etre ouvert. Reessaie dans un instant.",
        valeur: saisie,
      }
    }

    await reprendreLivraisonLiens(ouvert.dossierId)
  } catch {
    console.error('[porte] ouverture impossible')
    return {
      statut: 'erreur',
      message: "Le dossier n'a pas pu etre ouvert. Reessaie dans un instant.",
      valeur: saisie,
    }
  }

  return { statut: 'envoye' }
}
