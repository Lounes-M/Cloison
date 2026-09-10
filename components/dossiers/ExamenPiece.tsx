import { FormulaireExamen } from '@/components/forms/FormulaireExamen'
import { examen as t, type ExamenDocumentaire } from '@/lib/content/examen'

export function ExamenPiece({
  dossierId,
  pieceId,
  precedent,
  obsolete,
  modifiable,
}: {
  dossierId: string
  pieceId: string
  precedent?: ExamenDocumentaire
  obsolete: boolean
  modifiable: boolean
}) {
  if (obsolete) return <p className="w-full text-sm">{t.obsolete}</p>
  return (
    <details className="outlined bg-sky/20 w-full min-w-0 rounded-xl p-4">
      <summary className="cursor-pointer font-semibold">
        {t.titre} : {t.etats[precedent?.etat ?? 'a_examiner']}
      </summary>
      {precedent ? (
        <p className="mt-2 text-sm break-all">
          {new Date(precedent.cree_le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
          {t.par}
          {precedent.acteur ?? t.ancien}
        </p>
      ) : null}
      {modifiable ? (
        <FormulaireExamen dossierId={dossierId} pieceId={pieceId} precedent={precedent} />
      ) : null}
      <p className="mt-2 text-sm">{t.correction}</p>
    </details>
  )
}
