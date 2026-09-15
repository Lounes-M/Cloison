'use client'

import { useActionState, useState } from 'react'
import { attribuerPlusieurs, type EtatAttributions } from '@/lib/agences/action-attributions'
import { pilotage as t } from '@/lib/content/pilotage'

export type ChoixDossier = { id: string; revision: string | null; reference: string }

export function FormulaireAttributions({
  dossiers,
  choix,
  utilisateurId,
  disponible,
}: {
  dossiers: ChoixDossier[]
  choix: { id: string; email: string }[]
  utilisateurId: string
  disponible: boolean
}) {
  const [selection, selectionner] = useState<ChoixDossier[]>([])
  const [recu, conserverRecu] = useState<ChoixDossier[]>([])
  const [etat, action, attente] = useActionState<EtatAttributions, FormData>(attribuerPlusieurs, {
    statut: 'inactif',
    resultats: [],
  })
  return (
    <>
      <form
        action={action}
        onSubmit={() => {
          conserverRecu(selection)
        }}
        className="mt-4 grid gap-4"
      >
        <input
          type="hidden"
          name="liste"
          value={JSON.stringify(selection.map(({ id, revision }) => ({ id, revision })))}
        />
        <fieldset
          disabled={attente || !disponible || etat.statut === 'termine'}
          className="grid min-w-0 gap-3"
        >
          <legend className="mb-3 text-sm font-semibold">{t.selection(selection.length)}</legend>
          {dossiers.length === 0 ? (
            <p>{t.aucun}</p>
          ) : (
            dossiers.map((d) => (
              <label key={d.id} className="flex items-start gap-3 break-all">
                <input
                  type="checkbox"
                  checked={selection.some((s) => s.id === d.id)}
                  disabled={selection.length >= 20 && !selection.some((s) => s.id === d.id)}
                  onChange={(e) =>
                    selectionner((s) =>
                      e.target.checked ? [...s, d] : s.filter((v) => v.id !== d.id),
                    )
                  }
                />
                {d.reference}
              </label>
            ))
          )}
          <label className="grid min-w-0 gap-2 text-sm font-semibold">
            {t.choix}
            <select
              name="membre"
              defaultValue={utilisateurId}
              className="outlined w-full rounded-lg p-2"
            >
              <option value={utilisateurId}>{t.moi}</option>
              <option value="">{t.liberer}</option>
              {choix
                .filter((c) => c.id !== utilisateurId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.email}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input name="confirmation" type="checkbox" required />
            {t.confirmation}
          </label>
          <button
            type="submit"
            disabled={selection.length === 0}
            className="press outlined bg-cobalt text-paper rounded-lg p-3 font-bold disabled:opacity-50"
          >
            {attente ? t.attente : t.envoyer}
          </button>
        </fieldset>
      </form>
      {etat.statut === 'erreur' ? (
        <p role="alert" className="mt-4">
          {t.erreur}
        </p>
      ) : null}
      {etat.statut === 'termine' ? (
        <div role="status" className="mt-4">
          <h3 className="font-semibold">{t.bilan}</h3>
          <ul className="mt-2 grid gap-2">
            {etat.resultats.map((r) => (
              <li key={r.id} className="break-all">
                {recu.find((d) => d.id === r.id)?.reference ?? r.id} : {t.etats[r.etat]}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">{t.precaution}</p>
          <a href="" className="lien-espace mt-3">
            Actualiser la liste
          </a>
        </div>
      ) : null}
    </>
  )
}
