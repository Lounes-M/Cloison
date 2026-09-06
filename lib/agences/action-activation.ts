'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { notifierDemandeActivation } from '@/lib/courriels/activation'
import { contexteAgence } from './contexte'

/**
 * Demander l'activation de son agence.
 *
 * L'administrateur declare SIREN et carte professionnelle, et date sa demande.
 * Les trois colonnes lui sont accordees par la 0002 et la 0014, sous la
 * politique « Un admin decrit son agence » : un membre qui essaierait
 * obtiendrait zero ligne, et ce n'est pas ce code qui le lui dirait.
 *
 * L'ordre est celui de `enregistrement.ts` : on ecrit d'abord, on notifie
 * ensuite. Un courriel perdu ne doit pas transformer une demande bien
 * enregistree en erreur affichee.
 */

export type EtatActivation =
  | { statut: 'inactif' }
  | { statut: 'demandee' }
  | { statut: 'erreur'; message: string; valeurs?: { siren?: string; cartePro?: string } }

const schema = z.object({
  siren: z
    .string()
    .transform((valeur) => valeur.replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{9}$/, 'Le SIREN fait neuf chiffres.')),
  cartePro: z
    .string()
    .trim()
    .min(4, 'Le numero de carte professionnelle est trop court.')
    .max(60, 'Le numero de carte professionnelle est trop long.'),
})

export async function demanderLActivation(
  _precedent: EtatActivation,
  donnees: FormData,
): Promise<EtatActivation> {
  const valeurs = {
    siren: String(donnees.get('siren') ?? ''),
    cartePro: String(donnees.get('cartePro') ?? ''),
  }
  const analyse = schema.safeParse(valeurs)
  if (!analyse.success) {
    return {
      statut: 'erreur',
      message: analyse.error.issues[0]?.message ?? 'Saisie invalide.',
      valeurs,
    }
  }

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: 'Session expiree.' }
  const { supabase, agence, email } = contexte

  const { data, error } = await supabase
    .from('agences')
    .update({
      siren: analyse.data.siren,
      carte_pro: analyse.data.cartePro,
      activation_demandee_le: new Date().toISOString(),
    })
    .eq('id', agence.id)
    .select('id')

  if (error || !Array.isArray(data) || data.length === 0) {
    if (error) console.error('[activation] demande refusee')
    return {
      statut: 'erreur',
      message: 'Seul un administrateur de l’agence peut demander l’activation.',
      valeurs,
    }
  }

  // Ce que l'agence a essaye sur sa demonstration : c'est ce qui fait d'une
  // demande un prospect qualifie. Lu avec ses droits, donc sur ses dossiers.
  const { data: journal } = await supabase
    .from('journal_acces')
    .select('action')
    .eq('acteur', 'agence')

  const compte = (action: string) =>
    (journal ?? []).filter((ligne) => ligne.action === action).length

  await notifierDemandeActivation({
    agenceId: agence.id,
    nom: agence.nom,
    domaine: agence.domaine,
    siren: analyse.data.siren,
    cartePro: analyse.data.cartePro,
    demandeePar: email,
    essais: {
      consultations: compte('dossier_consulte'),
      piecesOuvertes: compte('piece_ouverte'),
      dossiersPris: compte('dossier_transmis'),
    },
  })

  revalidatePath('/espace')
  return { statut: 'demandee' }
}
