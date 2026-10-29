'use server'
import { z } from 'zod'
import { contexteAgence } from '@/lib/agences/contexte'
import { clientServeur } from '@/lib/acces/serveur'
import { consommerDebit } from '@/lib/acces/debit'
import { acte as t } from '@/lib/content/acte'
import { projetDepuisDossier } from './projet'

export type EtatModeleActe = { message: string; pdf?: string; nom?: string }

/**
 * Le projet d'acte, rendu pour relecture. Disponible meme quand le parcours de
 * signature est ferme : l'agence peut faire relire le modele, ou le signer
 * hors de Cloison en attendant le prestataire.
 */
export async function telechargerModeleActe(form: FormData): Promise<EtatModeleActe> {
  try {
    const dossier = z.uuid().parse(form.get('dossier'))
    const c = await contexteAgence()
    if (c.etat !== 'rattache' || c.agence.statut !== 'verifiee') throw new Error()
    const db = await clientServeur(AbortSignal.timeout(3000))
    if (!(await consommerDebit(db, 'depot_dossier', `modele-acte:${c.utilisateurId}`)))
      return { message: t.limite }
    const projet = await projetDepuisDossier(c.supabase, dossier, form, c.agence.nom)
    if (!projet.ok) return { message: t.refus[projet.motif] ?? t.erreur }
    return {
      message: t.pret,
      pdf: Buffer.from(projet.pdf).toString('base64'),
      nom: `acte-de-cautionnement-${dossier.slice(0, 8)}.pdf`,
    }
  } catch {
    return { message: t.erreur }
  }
}
