'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { contexteAgence } from './contexte'

const selection = z
  .array(z.strictObject({ id: z.uuid(), revision: z.uuid().nullable() }))
  .min(1)
  .max(20)
export type ResultatAttribution = {
  id: string
  etat: 'confirme' | 'refuse' | 'incertain' | 'non_traite'
}
export type EtatAttributions = {
  statut: 'inactif' | 'erreur' | 'termine'
  resultats: ResultatAttribution[]
}

export async function attribuerPlusieurs(
  _precedent: EtatAttributions,
  form: FormData,
): Promise<EtatAttributions> {
  const refus: EtatAttributions = { statut: 'erreur', resultats: [] }
  if (
    ['liste', 'membre', 'confirmation'].some((nom) => form.getAll(nom).length !== 1) ||
    form.get('confirmation') !== 'on'
  )
    return refus
  const brut = form.get('liste'),
    membre = form.get('membre')
  if (
    typeof brut !== 'string' ||
    brut.length > 4096 ||
    typeof membre !== 'string' ||
    (membre !== '' && !z.uuid().safeParse(membre).success)
  )
    return refus
  let demandes: z.infer<typeof selection>
  try {
    demandes = selection.parse(JSON.parse(brut))
  } catch {
    return refus
  }
  if (new Set(demandes.map((d) => d.id)).size !== demandes.length) return refus
  const resultats: ResultatAttribution[] = demandes.map((d) => ({ id: d.id, etat: 'non_traite' }))
  try {
    const c = await contexteAgence()
    if (
      c.etat !== 'rattache' ||
      (c.role !== 'admin' && membre !== '' && membre !== c.utilisateurId)
    )
      return refus
    const signal = AbortSignal.timeout(15000)
    for (let i = 0; i < demandes.length; i++) {
      if (signal.aborted) break
      const demande = demandes[i]!,
        resultat = resultats[i]!
      try {
        const { data, error } = await c.supabase
          .rpc('affecter_dossier', {
            le_dossier: demande.id,
            le_membre: membre || null,
            revision_attendue: demande.revision,
          })
          .abortSignal(signal)
        if (error || (data !== null && !z.uuid().safeParse(data).success)) {
          resultat.etat = 'incertain'
          break
        }
        resultat.etat = data === null ? 'refuse' : 'confirme'
      } catch {
        resultat.etat = 'incertain'
        break
      }
    }
    // Une panne de rafraichissement n'annule pas une mutation deja confirmee.
    try {
      revalidatePath('/espace')
      for (const r of resultats.filter((r) => r.etat === 'confirme' || r.etat === 'incertain'))
        revalidatePath(`/espace/dossiers/${r.id}`)
    } catch {
      /* Le bilan reste la preuve disponible ; l'interface invite a recharger. */
    }
    return { statut: 'termine', resultats }
  } catch {
    return refus
  }
}
