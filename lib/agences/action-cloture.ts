'use server'
import { traducteur } from '@/lib/messages'
import { createHash } from 'node:crypto'

import { revalidatePath } from 'next/cache'

import { clientServeur } from '@/lib/acces/serveur'
import { cloture as texteFr } from '@/lib/content/espace'
import { cloture as courrielsFr } from '@/lib/content/courriels'
import { cloture as courrielsEn } from '@/lib/content/en/courriels'
import { gabaritCourriel as gabaritEn } from '@/lib/content/en/gabarit-courriel'
import { gabaritCourriel as gabaritFr } from '@/lib/content/gabarit-courriel'
import { adresseDuSite, envoyer } from '@/lib/courriels/envoi'
import { composerCourriel } from '@/lib/courriels/gabarit'
import { langueDossier } from '@/lib/langue-preferee'
import { estUuidCanonique } from '@/lib/validation/uuid'
import { contexteAgence } from './contexte'
import { cloture as texteEn } from '@/lib/content/en/espace'
import { choisir, type Langue } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'

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
  const langue = await langueEspace()
  const dire = traducteur(langue)
  const texte = choisir(langue, texteFr, texteEn)

  const id = String(donnees.get('dossier') ?? '')
  const reference = String(donnees.get('reference') ?? '').trim()
  if (!estUuidCanonique(id) || reference.length === 0 || reference.length > 64) {
    return { statut: 'erreur', message: texte.erreur }
  }

  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') return { statut: 'erreur', message: dire('Session expirée.') }

  // La langue de chaque porteur se lit avant la cloture : apres elle, le
  // dossier n'a plus rien a dire. Elle ne sert qu'aux deux courriels d'adieu.
  const langues: Record<'locataire' | 'garant', Langue> = {
    locataire: (await langueDossier(id, 'locataire')) ?? 'fr',
    garant: (await langueDossier(id, 'garant')) ?? 'fr',
  }

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
  try {
    const db = await clientServeur()
    // Le second garant a son propre dossier, que cette action ne connait
    // pas : il lit la langue du premier.
    const envois: [string, unknown, 'locataire' | 'garant'][] = [
      ['locataire', clos.email_locataire, 'locataire'],
      ['garant', clos.email_garant, 'garant'],
      ['second', clos.email_second_garant, 'garant'],
    ]
    for (const [partie, adresse, espace] of envois) {
      if (typeof adresse !== 'string' || adresse.length === 0) continue
      const langueCourriel = langues[espace]
      const message = choisir(langueCourriel, courrielsFr, courrielsEn)[espace]
      const accepte = await envoyer(
        adresse,
        message.sujet,
        composerCourriel(
          {
            langue: langueCourriel,
            espace,
            sujet: message.sujet,
            paragraphes: [message.texte],
            details: [
              {
                libelle: choisir(langueCourriel, gabaritFr, gabaritEn).reference,
                valeur: String(clos.reference),
              },
            ],
          },
          adresseDuSite(),
        ),
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
