'use client'

import { useActionState, useId } from 'react'

import { activation as texte } from '@/lib/content/espace'
import { demanderLActivation, type EtatActivation } from '@/lib/agences/action-activation'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatActivation = { statut: 'inactif' }

const champBase =
  'w-full rounded-xl border-2 border-ink bg-paper px-4 py-3 text-[15px] font-medium ' +
  'placeholder:text-muted placeholder:font-normal'

/** SIREN et carte professionnelle : ce que la loi Hoguet demande, et rien de plus. */
export function FormulaireActivation({ siren, cartePro }: { siren: string; cartePro: string }) {
  const [etat, envoyer, enCours] = useActionState(demanderLActivation, ETAT_INITIAL)
  const id = useId()

  if (etat.statut === 'demandee') {
    return (
      <p className="bg-mint outlined rounded-xl px-4 py-3 text-[14px] font-semibold">
        {texte.succes}
      </p>
    )
  }

  const valeurs = etat.statut === 'erreur' ? (etat.valeurs ?? {}) : {}

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-4">
      {etat.statut === 'erreur' ? (
        <p className="bg-flame outlined text-ink rounded-xl px-4 py-3 text-[14px] font-semibold">
          {etat.message}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor={`${id}-siren`} className="mb-2 block text-[14px] font-bold">
            {texte.siren}
          </label>
          <input
            id={`${id}-siren`}
            name="siren"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            required
            defaultValue={valeurs.siren ?? siren}
            placeholder="123 456 789"
            className={cn(champBase)}
          />
        </div>
        <div>
          <label htmlFor={`${id}-carte`} className="mb-2 block text-[14px] font-bold">
            {texte.cartePro}
          </label>
          <input
            id={`${id}-carte`}
            name="cartePro"
            type="text"
            autoComplete="off"
            required
            defaultValue={valeurs.cartePro ?? cartePro}
            placeholder="CPI 6901 2026 000 000 001"
            className={cn(champBase)}
          />
        </div>
      </div>
      <p className="text-muted text-[13px] font-medium">{texte.aide}</p>

      <button
        type="submit"
        disabled={enCours}
        className={cn(
          'press outlined bg-cobalt shadow-brut rounded-brut cursor-pointer self-start px-8 py-4',
          'text-[17px] font-bold text-white disabled:cursor-wait disabled:opacity-70',
        )}
      >
        {enCours ? texte.envoi : texte.bouton}
      </button>
    </form>
  )
}
