'use server'

import { formulaireDuDossier } from '@/lib/acces/formulaire'
import { sessionPorteur } from '@/lib/content/session-porteur'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { verifierMention, type Element } from '@/lib/garant/mention'

/**
 * Le garant se nomme, et appose sa mention.
 *
 * Le serveur verifie ce qu'elle contient et dit ce qui manque ; il ne fournit
 * jamais la phrase, ni en entier ni en partie. C'est la consequence produit la
 * plus importante de l'ADR 0005 : une mention pre-remplie ferait tomber
 * l'engagement, a peine de nullite.
 *
 * Ce qui est ecrit l'est avec le jeton du garant, sur les seules colonnes que
 * la migration 0015 lui accorde. La date accompagne la mention : la base
 * refuse l'une sans l'autre.
 */

export type EtatMention =
  | { statut: 'inactif' }
  | { statut: 'apposee' }
  | { statut: 'erreur'; message: string; manques?: Element[]; valeurs?: Record<string, string> }

const schema = z.object({
  nom: z.string().trim().min(1, 'Ton nom est requis.').max(120),
  prenom: z.string().trim().min(1, 'Ton prenom est requis.').max(120),
  adresse: z.string().trim().min(5, 'Ton adresse est requise.').max(400),
  mention: z
    .string()
    .trim()
    .min(40, 'La mention est trop courte pour contenir ce que la loi exige.')
    .max(2000, 'La mention est trop longue.'),
})

export async function apposerMaMention(_p: EtatMention, donnees: FormData): Promise<EtatMention> {
  const valeurs: Record<string, string> = {}
  for (const nom of ['nom', 'prenom', 'adresse', 'mention']) {
    valeurs[nom] = String(donnees.get(nom) ?? '')
  }

  const analyse = schema.safeParse(valeurs)
  if (!analyse.success) {
    return {
      statut: 'erreur',
      message: analyse.error.issues[0]?.message ?? 'Saisie invalide.',
      valeurs,
    }
  }

  const porteur = await capaciteDepuisCookies()
  if (porteur && !formulaireDuDossier(donnees, porteur.capacite.dossierId)) {
    return { statut: 'erreur', message: sessionPorteur.autreDossier }
  }
  if (!porteur || porteur.capacite.partie !== 'garant') {
    return {
      statut: 'erreur',
      message: 'Ton lien a expire. Demande au locataire de te le renvoyer.',
    }
  }

  const supabase = clientPorteurDeLien(porteur.jeton)
  const { dossierId } = porteur.capacite

  // Solidaire ou non : c'est ce que le garant a declare, et c'est ce qui
  // decide si la renonciation est exigee.
  const { data: engagement } = await supabase
    .from('engagements')
    .select('solidaire, montant_max_cents')
    .eq('dossier_id', dossierId)
    .maybeSingle()

  if (!engagement) {
    return {
      statut: 'erreur',
      message: 'Declare d abord ce que tu couvres, plus haut sur cette page.',
      valeurs,
    }
  }

  const verdict = verifierMention(analyse.data.mention, Boolean(engagement.solidaire))
  if (!verdict.ok || verdict.montantEuros * 100 !== Number(engagement.montant_max_cents)) {
    return {
      statut: 'erreur',
      message: 'Il manque quelque chose a ta mention.',
      manques: verdict.ok ? ['montant'] : verdict.manques,
      valeurs,
    }
  }

  const { data: enregistre, error } = await supabase
    .from('engagements')
    .update({
      nom: analyse.data.nom,
      prenom: analyse.data.prenom,
      adresse: analyse.data.adresse,
      mention: analyse.data.mention,
      mention_saisie_le: new Date().toISOString(),
    })
    .eq('dossier_id', dossierId)
    .select('dossier_id')
    .maybeSingle()

  if (error || !enregistre) {
    console.error('[garant] mention refusee')
    return {
      statut: 'erreur',
      message: "L'enregistrement n'a pas abouti. Reessaie dans un instant.",
      valeurs,
    }
  }

  revalidatePath('/garant')
  return { statut: 'apposee' }
}
