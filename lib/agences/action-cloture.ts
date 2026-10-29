'use server'
import { createHash } from 'node:crypto'

import { revalidatePath } from 'next/cache'

import { clientServeur } from '@/lib/acces/serveur'
import { cloture as texte } from '@/lib/content/espace'
import { cloture as courriels, pied } from '@/lib/content/courriels'
import { envoyer } from '@/lib/courriels/envoi'
import { estUuidCanonique } from '@/lib/validation/uuid'
import { contexteAgence } from './contexte'

export type EtatCloture =
  | { statut: 'inactif' }
  | { statut: 'clos'; reference: string }
  | { statut: 'erreur'; message: string }

/** Une identite stable par dossier et destinataire : un nouvel essai ne double pas l'envoi. */
function identifiant(dossierId: string, partie: string): string {
  const hex = createHash('sha256').update(`cloture:${dossierId}:${partie}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * Clore un dossier avant son echeance (migration 0066).
 *
 * Tout ce qui protege est en base : role, responsable, statut, reference
 * retapee et destruction des jetons et de la cle dans la meme transaction.
 * L'action ne fait que mettre en file les deux courriels de cloture, que la
 * file de notifications ne porterait plus pour un dossier echu.
 */
export async function cloreLeDossier(_p: EtatCloture, donnees: FormData): Promise<EtatCloture> {
  const id = String(donnees.get('dossier') ?? '')
  const reference = String(donnees.get('reference') ?? '').trim()
  if (!estUuidCanonique(id) || reference.length === 0 || reference.length > 64) {
    return { statut: 'erreur', message: texte.erreur }
  }

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: 'Session expirée.' }

  const { data, error } = await contexte.supabase.rpc('clore_dossier', {
    le_dossier: id,
    la_reference: reference,
  })
  if (error || !data || typeof data !== 'object') {
    if (error) console.error('[agence] cloture refusee')
    return { statut: 'erreur', message: texte.erreur }
  }

  const clos = data as {
    reference?: unknown
    email_locataire?: unknown
    email_garant?: unknown
    email_second_garant?: unknown
  }
  const signature = `\n\nRéférence du dossier : ${String(clos.reference)}\n\n${pied}`
  try {
    const db = await clientServeur()
    const envois: [string, unknown, { sujet: string; texte: string }][] = [
      ['locataire', clos.email_locataire, courriels.locataire],
      ['garant', clos.email_garant, courriels.garant],
      ['second', clos.email_second_garant, courriels.garant],
    ]
    for (const [partie, adresse, message] of envois) {
      if (typeof adresse !== 'string' || adresse.length === 0) continue
      const accepte = await envoyer(
        adresse,
        message.sujet,
        message.texte + signature,
        identifiant(id, partie),
        undefined,
        true,
        { db },
      )
      if (!accepte) console.error('[agence] courriel de cloture non programme')
    }
  } catch {
    console.error('[agence] courriel de cloture non programme')
  }

  revalidatePath('/espace')
  return { statut: 'clos', reference: String(clos.reference) }
}
