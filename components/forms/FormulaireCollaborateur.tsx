'use client'
import { useActionState, useId } from 'react'
import { modifierCollaborateur } from '@/lib/agences/action-collaborateur'
import { collaborateurs as textes } from '@/lib/content/collaborateurs'
export function FormulaireCollaborateur({
  agence,
  cible,
  avant,
  soi,
  admissible,
}: {
  agence: string
  cible: string
  avant: 'admin' | 'membre' | 'exclu'
  soi: boolean
  admissible: boolean
}) {
  const [etat, envoyer, enCours] = useActionState(modifierCollaborateur, {})
  const id = useId()
  return (
    <form action={envoyer} className="mt-3 grid gap-3">
      <input type="hidden" name="agence" value={agence} />
      <input type="hidden" name="cible" value={cible} />
      <input type="hidden" name="avant" value={avant} />
      {etat.message ? (
        <p role={etat.erreur ? 'alert' : 'status'} className="text-sm font-semibold">
          {etat.message}
        </p>
      ) : null}
      <label htmlFor={id} className="text-sm font-semibold">
        {textes.action}
      </label>
      <select
        id={id}
        name="operation"
        defaultValue=""
        required
        className="outlined bg-paper w-full rounded-lg px-3 py-2"
      >
        <option value="" disabled>
          {textes.choisir}
        </option>
        {avant === 'exclu' ? (
          <option value="readmettre" disabled={!admissible}>
            {textes.readmettre}
          </option>
        ) : (
          <>
            {avant === 'membre' && admissible ? (
              <option value="admin">{textes.promouvoir}</option>
            ) : null}
            {avant === 'admin' ? <option value="membre">{textes.retrograder}</option> : null}
            {!soi ? <option value="exclure">{textes.exclure}</option> : null}
          </>
        )}
      </select>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmation" required className="mt-1" />
        {textes.confirmer}
      </label>
      <button
        type="submit"
        disabled={enCours}
        className="press shadow-brut-xs outlined bg-sky cursor-pointer rounded-lg px-4 py-2 font-bold disabled:translate-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {enCours ? textes.attente : textes.appliquer}
      </button>
    </form>
  )
}
