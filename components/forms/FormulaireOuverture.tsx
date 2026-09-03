'use client'

import { useActionState, useEffect, useId, useRef } from 'react'

import { porte } from '@/lib/content/locataire'
import { ouvrirMonDossier, type EtatOuverture } from '@/lib/locataire/action-ouverture'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatOuverture = { statut: 'inactif' }

/**
 * La porte principale : un champ, un bouton.
 *
 * Aucune restriction de domaine ici, a l'inverse du formulaire agence : un
 * locataire a une adresse personnelle, et c'est normal.
 */
export function FormulaireOuverture() {
  const [etat, envoyer, enCours] = useActionState(ouvrirMonDossier, ETAT_INITIAL)
  const idChamp = useId()
  const resume = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (etat.statut === 'envoye') resume.current?.focus()
  }, [etat])

  if (etat.statut === 'envoye') {
    return (
      <div
        ref={resume}
        tabIndex={-1}
        className="bg-mint outlined shadow-brut rounded-[18px] p-8 text-center"
      >
        <p className="font-display text-2xl uppercase">{porte.succesTitre}</p>
        <p className="mx-auto mt-3 max-w-[380px] text-[15px] leading-relaxed font-medium">
          {porte.succesTexte}
        </p>
      </div>
    )
  }

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-5">
      {etat.statut === 'erreur' ? (
        <p className="bg-flame outlined rounded-xl px-4 py-3 text-[14px] font-semibold text-white">
          {etat.message}
        </p>
      ) : null}

      <div>
        <label htmlFor={idChamp} className="mb-2 block text-[14px] font-bold">
          {porte.champ}
        </label>
        <input
          id={idChamp}
          name="courriel"
          type="email"
          autoComplete="email"
          required
          defaultValue={etat.statut === 'erreur' ? etat.valeur : ''}
          placeholder="toi@exemple.fr"
          aria-describedby={`${idChamp}-aide`}
          className={cn(
            'border-ink bg-paper w-full rounded-xl border-2 px-4 py-3 text-[15px] font-medium',
            'placeholder:text-muted placeholder:font-normal',
          )}
        />
        <p id={`${idChamp}-aide`} className="text-muted mt-2 text-[13px] font-medium">
          {porte.aide}
        </p>
      </div>

      <button
        type="submit"
        disabled={enCours}
        className={cn(
          'press outlined bg-flame shadow-brut rounded-brut cursor-pointer px-8 py-4',
          'text-[17px] font-bold text-white disabled:cursor-wait disabled:opacity-70',
        )}
      >
        {enCours ? porte.envoi : porte.bouton}
      </button>
    </form>
  )
}
