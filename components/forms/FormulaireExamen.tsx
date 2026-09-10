'use client'
import { useActionState, useId } from 'react'
import { enregistrerExamen, type EtatExamen } from '@/lib/agences/action-examen'
import { examen as t, type ExamenDocumentaire } from '@/lib/content/examen'
export function FormulaireExamen({
  dossierId,
  pieceId,
  precedent,
}: {
  dossierId: string
  pieceId: string
  precedent?: ExamenDocumentaire
}) {
  const [etat, envoyer, attente] = useActionState(enregistrerExamen, {
    statut: 'inactif',
  } as EtatExamen)
  const id = useId()
  return (
    <form action={envoyer} className="mt-3 grid w-full gap-3">
      <input type="hidden" name="dossier" value={dossierId} />
      <input type="hidden" name="piece" value={pieceId} />
      <input type="hidden" name="revision" value={precedent?.revision ?? ''} />
      <label htmlFor={id}>{t.choix}</label>
      <select
        key={precedent?.revision ?? 'nouveau'}
        id={id}
        name="etat"
        defaultValue={precedent?.etat ?? 'a_examiner'}
        disabled={attente}
        className="outlined bg-paper max-w-full rounded-lg px-3 py-2"
      >
        {Object.entries(t.etats).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="confirmation" required disabled={attente} />
        {t.confirmation}
      </label>
      <button
        disabled={attente}
        className="outlined bg-sky rounded-lg px-4 py-2 font-bold disabled:opacity-50"
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
