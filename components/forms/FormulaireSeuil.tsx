'use client'

import { useActionState, useId } from 'react'

import { tableau } from '@/lib/content/espace'
import { reglerLeSeuil, type EtatSeuil } from '@/lib/agences/action-dossier'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatSeuil = { statut: 'inactif' }

/** Le curseur de la tache 30 : combien de fois le loyer. Administrateur seulement. */
export function FormulaireSeuil({ seuilActuel }: { seuilActuel: string }) {
  const [etat, envoyer, enCours] = useActionState(reglerLeSeuil, ETAT_INITIAL)
  const idChamp = useId()

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-4">
      {etat.statut === 'enregistre' ? (
        <p className="bg-mint outlined rounded-xl px-4 py-3 text-[14px] font-semibold">
          {tableau.seuilSucces}
        </p>
      ) : null}
      {etat.statut === 'erreur' ? (
        <p className="bg-flame outlined rounded-xl px-4 py-3 text-[14px] font-semibold text-white">
          {etat.message}
        </p>
      ) : null}

      <div className="flex items-end gap-3">
        <div>
          <label htmlFor={idChamp} className="mb-2 block text-[14px] font-bold">
            {tableau.seuilChamp}
          </label>
          <input
            id={idChamp}
            name="seuil"
            type="text"
            inputMode="decimal"
            required
            defaultValue={etat.statut === 'erreur' ? (etat.valeur ?? '') : seuilActuel}
            className={cn(
              'border-ink bg-paper w-28 rounded-xl border-2 px-4 py-3 text-[15px] font-medium',
            )}
          />
        </div>
        <button
          type="submit"
          disabled={enCours}
          className={cn(
            'press outlined bg-paper shadow-brut-xs cursor-pointer rounded-[10px] px-5 py-3',
            'text-[14px] font-bold disabled:cursor-wait disabled:opacity-70',
          )}
        >
          {enCours ? tableau.seuilEnvoi : tableau.seuilBouton}
        </button>
      </div>
    </form>
  )
}
