import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ErreurApimo, creerClientApimo } from './client'
import { identifiantApimo, ouvrirIdentifiantsApimo } from './secret'
import { ETATS_RETOUR, messageDeSuivi } from './suivi'

/**
 * Rendre a Apimo l'etat des dossiers ouverts depuis ses fiches.
 *
 * La base choisit ce qui est du (`reserver_retours_apimo`) : un dossier lie,
 * une agence qui a demande le retour, un etat different du dernier inscrit.
 * Chaque envoi est reserve avant de partir et confirme apres ; une issue
 * inconnue reste en suspens et ne se rejoue pas.
 */
const retour = z.strictObject({
  dossier: z.uuid(),
  reference: z.string().min(8).max(32),
  etat: z.enum(ETATS_RETOUR),
  bien: z.string().regex(/^[0-9]{1,12}$/),
  bail: z.string().max(40).nullable(),
  agence: z.uuid(),
  fournisseur: identifiantApimo,
  agence_apimo: identifiantApimo,
  jeton_scelle: z.string().min(60).max(1402),
})

export async function rendreEtatsApimo(
  db: SupabaseClient,
  budget: AbortSignal,
  transport: typeof fetch = fetch,
  combien = 20,
): Promise<{ traites: number; echecs: number }> {
  const { data, error } = await db.rpc('reserver_retours_apimo', { combien })
  const lus = z.array(z.unknown()).max(50).safeParse(data)
  if (error || !lus.success) throw new Error('Reservation des retours indisponible')

  let traites = 0
  let echecs = 0
  for (const brut of lus.data) {
    const r = retour.safeParse(brut)
    if (!r.success) {
      // Une ligne illisible reste reservee : elle ne part pas, et se voit.
      echecs++
      continue
    }
    let issue: 'envoye' | 'refuse' | 'incertain' = 'refuse'
    // Le budget epuise avant l'envoi : rien n'est parti, le prochain cycle reprend.
    if (!budget.aborted) {
      try {
        const identifiants = ouvrirIdentifiantsApimo(r.data.jeton_scelle, {
          agence: r.data.agence,
          fournisseur: r.data.fournisseur,
          agenceApimo: r.data.agence_apimo,
        })
        const client = creerClientApimo(identifiants, {
          autoriserEcritures: true,
          transport,
          budget,
        })
        await client.ecrireSuivi(
          r.data.bien,
          messageDeSuivi(r.data.reference, r.data.etat, r.data.bail),
        )
        issue = 'envoye'
      } catch (erreur) {
        issue =
          erreur instanceof ErreurApimo && erreur.code === 'incertain' ? 'incertain' : 'refuse'
      }
    }
    if (issue === 'envoye') traites++
    else echecs++
    if (issue !== 'envoye') console.error('[apimo] retour d etat non inscrit')
    const { data: note, error: refus } = await db.rpc('confirmer_retour_apimo', {
      le_dossier: r.data.dossier,
      l_etat: r.data.etat,
      l_issue: issue,
    })
    if (refus || note !== true) {
      console.error('[apimo] issue du retour non consignee')
      if (issue === 'envoye') {
        traites--
        echecs++
      }
    }
  }
  return { traites, echecs }
}
