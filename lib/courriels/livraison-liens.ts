import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clientServeur } from '@/lib/acces/serveur'
import { signerJeton, type Partie } from '@/lib/acces/jeton'
import { urlDuLien } from '@/lib/acces/session'
import { envoyerLienGarant, envoyerLienLocataire } from './liens'

/** Reprend les intentions enregistrees avec le jeton, meme apres un arret serveur. */
export async function livrerLiens(
  db: SupabaseClient,
  dossierId?: string,
  signal?: AbortSignal,
  differer = true,
) {
  const { data, error } = await db.rpc('liens_a_livrer', { le_dossier: dossierId ?? null })
  if (error) throw new Error('Livraisons indisponibles')
  let echecs = 0
  for (const lien of data ?? []) {
    signal?.throwIfAborted()
    try {
      if (!['locataire', 'garant'].includes(lien.partie)) throw new Error('Partie invalide')
      const expireLe = new Date(lien.expire_le)
      if (!Number.isFinite(expireLe.getTime()) || expireLe.getTime() <= Date.now()) continue
      const jeton = await signerJeton(lien.dossier_id, lien.partie as Partie, lien.id, expireLe)
      const envoi = {
        a: lien.destinataire,
        reference: lien.reference,
        url: urlDuLien(jeton),
        expireLe,
        livraison: { db, id: lien.id, signal, differer },
      }
      const accepte =
        lien.partie === 'garant'
          ? await envoyerLienGarant({ ...envoi, demandePar: lien.demande_par })
          : await envoyerLienLocataire(envoi)
      if (!accepte) echecs++
    } catch {
      echecs++
    }
  }
  return { echecs }
}

/** L'intention est deja durable. Une panne ici ne reclame pas un nouveau dossier. */
export async function reprendreLivraisonLiens(dossierId: string): Promise<void> {
  try {
    const budget = AbortSignal.timeout(10_000)
    const resultat = await livrerLiens(await clientServeur(budget), dossierId, budget, false)
    if (resultat.echecs) console.error('[courriel] liens en attente de reprise')
  } catch {
    console.error('[courriel] liens en attente de reprise')
  }
}
