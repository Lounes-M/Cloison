'use client'
import { useActionState, useId } from 'react'
import { documentsDeclares, engagement } from '@/lib/content/garant'
import { declarerNombreDocuments, type EtatDocuments } from '@/lib/garant/action-documents'
export function FormulaireNombreDocuments({
  dossierId,
  pieceId,
  actuel,
  maximum,
}: {
  dossierId: string
  pieceId: string
  actuel: number
  maximum: number
}) {
  const [etat, envoyer, enCours] = useActionState(declarerNombreDocuments, {} as EtatDocuments)
  const id = useId()
  return (
    <form action={envoyer} className="mt-2 flex w-full flex-wrap items-center gap-3">
      <input type="hidden" name="dossier" value={dossierId} />
      <input type="hidden" name="piece" value={pieceId} />
      <label htmlFor={id} className="text-sm">
        {documentsDeclares.nombre}
      </label>
      <select
        id={id}
        name="nombre_documents"
        defaultValue={actuel}
        disabled={enCours}
        className="border-ink bg-paper rounded-lg border-2 px-2 py-1"
      >
        {Array.from({ length: maximum }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <button disabled={enCours} className="lien-espace disabled:opacity-50">
        {documentsDeclares.corriger}
      </button>
      {etat.erreur ? (
        <p role="alert" className="w-full text-sm">
          {etat.erreur}
        </p>
      ) : null}
      {etat.enregistre ? (
        <p role="status" className="w-full text-sm">
          {engagement.succes}
        </p>
      ) : null}
    </form>
  )
}
