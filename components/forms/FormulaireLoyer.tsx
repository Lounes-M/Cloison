'use client'

import { useActionState, useId } from 'react'

import { espace } from '@/lib/content/locataire'
import { saisirMonLoyer, type EtatLoyer } from '@/lib/locataire/action-loyer'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatLoyer = { statut: 'inactif' }

/** Un champ, un bouton : le loyer, charges comprises. */
export function FormulaireLoyer({ loyerActuel }: { loyerActuel: string }) {
  const [etat, envoyer, enCours] = useActionState(saisirMonLoyer, ETAT_INITIAL)
  const idChamp = useId()

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-4">
      {etat.statut === 'enregistre' ? (
        <p className="bg-mint outlined rounded-xl px-4 py-3 text-[14px] font-semibold">
          {espace.loyerSucces}
        </p>
      ) : null}
      {etat.statut === 'erreur' ? (
        <p className="bg-flame outlined text-ink rounded-xl px-4 py-3 text-[14px] font-semibold">
          {etat.message}
        </p>
      ) : null}

      <div>
        <label htmlFor={idChamp} className="mb-2 block text-[14px] font-bold">
          {espace.loyerChamp}
        </label>
        <div className="flex items-center gap-3">
          <input
            id={idChamp}
            name="loyer"
            type="text"
            inputMode="decimal"
            required
            defaultValue={etat.statut === 'erreur' ? (etat.valeur ?? '') : loyerActuel}
            placeholder="850"
            className={cn(
              'border-ink bg-paper w-full rounded-xl border-2 px-4 py-3 text-[15px] font-medium',
              'placeholder:text-muted placeholder:font-normal',
            )}
          />
          <span className="text-[15px] font-bold">€</span>
        </div>
      </div>

      <button
        type="submit"
        disabled={enCours}
        className={cn(
          'press outlined bg-cobalt shadow-brut rounded-brut cursor-pointer self-start px-8 py-4',
          'text-[17px] font-bold text-white disabled:cursor-wait disabled:opacity-70',
        )}
      >
        {enCours ? espace.loyerEnvoi : espace.loyerBouton}
      </button>
    </form>
  )
}
