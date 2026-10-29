'use client'

import { useActionState, useId } from 'react'

import { fixerLeLoyer, type EtatLoyerAgence } from '@/lib/agences/action-loyer'
import { loyerAgence as texte } from '@/lib/content/espace'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatLoyerAgence = { statut: 'inactif' }

/** Fixer ou corriger le loyer d'un dossier, tant que le garant n'a pas declare. */
export function FormulaireLoyerAgence({
  dossierId,
  loyerActuel,
}: {
  dossierId: string
  loyerActuel: string
}) {
  const [etat, envoyer, enCours] = useActionState(fixerLeLoyer, ETAT_INITIAL)
  const idChamp = useId()

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-3">
      <input type="hidden" name="dossier" value={dossierId} />
      {etat.statut === 'enregistre' ? (
        <p
          role="status"
          className="bg-mint outlined rounded-xl px-4 py-3 text-[14px] font-semibold"
        >
          {texte.succes}
        </p>
      ) : null}
      {etat.statut === 'erreur' ? (
        <p
          role="alert"
          className="bg-flame outlined text-ink rounded-xl px-4 py-3 text-[14px] font-semibold"
        >
          {etat.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="max-w-full min-w-0">
          <label htmlFor={idChamp} className="mb-2 block text-[14px] font-bold">
            {texte.champ}
          </label>
          <input
            id={idChamp}
            name="loyer"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            required
            defaultValue={etat.statut === 'erreur' ? (etat.valeur ?? '') : loyerActuel}
            placeholder="850"
            className="border-ink bg-paper w-full max-w-[220px] rounded-xl border-2 px-4 py-3 text-[15px] font-medium"
          />
        </div>
        <button
          type="submit"
          disabled={enCours}
          className={cn(
            'press outlined bg-paper shadow-brut-xs min-h-11 cursor-pointer rounded-[10px] px-5 py-3',
            'text-[14px] font-bold disabled:cursor-wait disabled:opacity-70',
          )}
        >
          {enCours ? texte.envoi : texte.bouton}
        </button>
      </div>
    </form>
  )
}
