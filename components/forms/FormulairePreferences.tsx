'use client'
import { useActionState, useId } from 'react'
import { reglerNotifications, type EtatPreferences } from '@/lib/agences/action-preferences'
import { preferences as t, type PreferenceNotifications } from '@/lib/content/preferences'
export function FormulairePreferences({ courante }: { courante: PreferenceNotifications }) {
  const [etat, envoyer, attente] = useActionState(reglerNotifications, {
    statut: 'inactif',
  } as EtatPreferences)
  const id = useId()
  return (
    <form action={envoyer} autoComplete="off" className="grid min-w-0 gap-4">
      <input type="hidden" name="revision" value={courante.revision ?? ''} />
      <label htmlFor={id} className="font-semibold">
        {t.choix}
      </label>
      <select
        key={courante.revision ?? 'nouveau'}
        id={id}
        name="mode"
        defaultValue={courante.mode}
        disabled={attente}
        className="outlined bg-paper w-full min-w-0 rounded-lg px-3 py-2"
      >
        {Object.entries(t.modes).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmation" required disabled={attente} />
        {t.confirmation}
      </label>
      <button disabled={attente} className="bouton-espace disabled:opacity-50">
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
