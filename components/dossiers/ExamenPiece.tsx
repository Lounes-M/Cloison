import { FormulaireExamen } from '@/components/forms/FormulaireExamen'
import { examen as tFr, type ExamenDocumentaire } from '@/lib/content/examen'
import { examen as tEn } from '@/lib/content/en/examen'
import { choisir, locale } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'

export async function ExamenPiece({
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
  const langue = await langueEspace()
  const t = choisir(langue, tFr, tEn)

  if (obsolete) return <p className="w-full text-sm">{t.obsolete}</p>
  return (
    <details className="outlined bg-sky/20 w-full min-w-0 rounded-xl p-4">
      <summary className="cursor-pointer font-semibold">
        {t.titre} : {t.etats[precedent?.etat ?? 'a_examiner']}
      </summary>
      {precedent ? (
        <p className="mt-2 text-sm break-all">
          {new Date(precedent.cree_le).toLocaleString(locale(langue), { timeZone: 'Europe/Paris' })}
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
