'use client'
import { useActionState, useId } from 'react'
import { reglerRappels, type EtatRappels } from '@/lib/agences/action-rappels'
import { rappels as t, type ReglagesRappels } from '@/lib/content/rappels'
export function FormulaireRappels({ courants }: { courants: ReglagesRappels }) {
  const [etat, envoyer, attente] = useActionState(reglerRappels, {
    statut: 'inactif',
  } as EtatRappels)
  const id = useId()
  return (
    <form action={envoyer} autoComplete="off" className="grid min-w-0 gap-4">
      <input type="hidden" name="revision" value={courants.revision ?? ''} />
      <label htmlFor={`${id}-relance`} className="font-semibold">
        {t.relance}
      </label>
      <select
        key={`relance-${courants.revision}`}
        id={`${id}-relance`}
        name="relance"
        defaultValue={courants.relance_jours}
        disabled={attente}
        className="outlined bg-paper w-full min-w-0 rounded-lg px-3 py-2"
      >
        {[0, 3, 7, 14].map((n) => (
          <option key={n} value={n}>
            {n ? t.jours(n) : t.desactive}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-echeance`} className="font-semibold">
        {t.echeance}
      </label>
      <select
        key={`echeance-${courants.revision}`}
        id={`${id}-echeance`}
        name="echeance"
        defaultValue={courants.echeance_jours}
        disabled={attente}
        className="outlined bg-paper w-full min-w-0 rounded-lg px-3 py-2"
      >
        {[0, 3, 7].map((n) => (
          <option key={n} value={n}>
            {n ? t.jours(n) : t.desactive}
          </option>
        ))}
      </select>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmation" required disabled={attente} />
        {t.confirmation}
      </label>
      <button
        disabled={attente}
        className="press outlined bg-cobalt text-paper shadow-brut-xs cursor-pointer rounded-lg px-4 py-2 font-bold disabled:opacity-50"
      >
        {attente ? t.attente : t.enregistrer}
      </button>
      {!attente && etat.statut === 'erreur' ? (
        <p role="alert">{t.erreur}</p>
      ) : !attente && etat.statut === 'enregistre' ? (
        <p role="status">{t.succes}</p>
      ) : null}
    </form>
  )
}
