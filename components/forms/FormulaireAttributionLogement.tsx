'use client'

import { useActionState, useId } from 'react'

import { attribuerLeLogement, type EtatAttribution } from '@/lib/agences/action-logements'
import { logements as texte } from '@/lib/content/logements'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatAttribution = { statut: 'inactif' }

/**
 * Attribuer le logement au candidat retenu.
 *
 * La case a cocher dit ce qui va partir : un refus pour chaque autre
 * candidat complet ou pris. L'action la verifie aussi.
 */
export function FormulaireAttributionLogement({
  logementId,
  retenus,
}: {
  logementId: string
  retenus: { id: string; reference: string }[]
}) {
  const [etat, envoyer, enCours] = useActionState(attribuerLeLogement, ETAT_INITIAL)
  const idChamp = useId()
  const idCase = useId()

  if (etat.statut === 'attribue') {
    return (
      <p role="status" className="bg-mint outlined rounded-xl px-4 py-3 text-[14px] font-semibold">
        {texte.attribution.succes(etat.refuses)}
      </p>
    )
  }

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="logement" value={logementId} />
      {etat.statut === 'erreur' ? (
        <p
          role="alert"
          className="bg-flame outlined text-ink rounded-xl px-4 py-3 text-[14px] font-semibold"
        >
          {etat.message}
        </p>
      ) : null}
      <div className="max-w-full min-w-0">
        <label htmlFor={idChamp} className="mb-2 block text-[14px] font-bold">
          {texte.attribution.champ}
        </label>
        <select
          id={idChamp}
          name="dossier"
          defaultValue={retenus[0]?.id}
          className="border-ink bg-paper w-full max-w-[320px] rounded-xl border-2 px-4 py-3 text-[15px] font-medium"
        >
          {retenus.map((r) => (
            <option key={r.id} value={r.id}>
              {r.reference}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-start gap-3">
        <input
          id={idCase}
          name="confirme"
          value="oui"
          type="checkbox"
          required
          className="accent-ink mt-1 size-5 shrink-0"
        />
        <label htmlFor={idCase} className="text-[14px] font-semibold">
          {texte.attribution.confirmation}
        </label>
      </div>
      <div>
        <button
          type="submit"
          disabled={enCours}
          className={cn(
            'press outlined bg-paper shadow-brut-xs min-h-11 cursor-pointer rounded-[10px] px-5 py-3',
            'text-[14px] font-bold disabled:cursor-wait disabled:opacity-70',
          )}
        >
          {enCours ? texte.attribution.envoi : texte.attribution.bouton}
        </button>
      </div>
    </form>
  )
}
