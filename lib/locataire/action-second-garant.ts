'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'

import { consommerDebit } from '@/lib/acces/debit'
import { formulaireDuDossier } from '@/lib/acces/formulaire'
import { clientServeur } from '@/lib/acces/serveur'
import { capaciteDepuisCookies, clientPorteurDeLien } from '@/lib/acces/session'
import { secondGarant as texte } from '@/lib/content/locataire'
import { sessionPorteur } from '@/lib/content/session-porteur'
import { reprendreLivraisonLiens } from '@/lib/courriels/livraison-liens'

/**
 * Le locataire designe un second garant, ou lui renvoie son lien.
 *
 * Tout se decide en base (`designer_second_garant`, migration 0067) : dossier
 * d'agence, premier garant deja designe, adresse distincte, dossier ouvert.
 * Le second garant recoit son propre dossier, lie au principal ; c'est ce
 * dossier-la dont l'intention de livraison est reprise ici.
 */

export type EtatSecondGarant =
  | { statut: 'inactif' }
  | { statut: 'envoye'; a: string }
  | { statut: 'erreur'; message: string; valeur?: string }

const schema = z.string().trim().toLowerCase().min(5).max(180).pipe(z.email())

async function empreinteAppelant(): Promise<string> {
  const entetes = await headers()
  return (
    entetes.get('x-forwarded-for')?.split(',')[0]?.trim() || entetes.get('x-real-ip') || 'inconnu'
  )
}

export async function designerSecondGarant(
  _precedent: EtatSecondGarant,
  donnees: FormData,
): Promise<EtatSecondGarant> {
  const saisie = String(donnees.get('courriel') ?? '')
  const analyse = schema.safeParse(saisie)
  if (!analyse.success) return { statut: 'erreur', message: texte.erreurs.adresse, valeur: saisie }
  const courriel = analyse.data

  const porteur = await capaciteDepuisCookies()
  if (porteur && !formulaireDuDossier(donnees, porteur.capacite.dossierId)) {
    return { statut: 'erreur', message: sessionPorteur.autreDossier }
  }
  if (!porteur || porteur.capacite.partie !== 'locataire') {
    return { statut: 'erreur', message: texte.erreurs.expire }
  }

  try {
    if (!(await consommerDebit(await clientServeur(), 'lien_garant', await empreinteAppelant()))) {
      return { statut: 'erreur', message: texte.erreurs.debit, valeur: saisie }
    }
    const supabase = clientPorteurDeLien(porteur.jeton)
    const { data: dossier } = await supabase
      .from('dossiers')
      .select('email_locataire, email_garant')
      .eq('id', porteur.capacite.dossierId)
      .maybeSingle()
    if (!dossier) return { statut: 'erreur', message: texte.erreurs.expire }
    if (
      courriel === String(dossier.email_locataire).toLowerCase() ||
      courriel === String(dossier.email_garant ?? '').toLowerCase()
    ) {
      return { statut: 'erreur', message: texte.erreurs.doublon, valeur: saisie }
    }

    const { data, error } = await supabase.rpc('designer_second_garant', { courriel })
    const emis = Array.isArray(data) ? data[0] : null
    if (error || !emis?.dossier || !emis.jti) {
      return { statut: 'erreur', message: texte.erreurs.refus, valeur: saisie }
    }
    await reprendreLivraisonLiens(String(emis.dossier))
  } catch {
    console.error('[locataire] second garant impossible')
    return { statut: 'erreur', message: texte.erreurs.refus, valeur: saisie }
  }

  revalidatePath('/locataire')
  return { statut: 'envoye', a: courriel }
}
