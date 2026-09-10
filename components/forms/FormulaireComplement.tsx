'use client'
import { useActionState, useId } from 'react'
import { modifierComplement, type EtatComplement } from '@/lib/agences/action-complement'
import { complements as t } from '@/lib/content/complements'
export function FormulaireComplement({
  dossierId,
  cible,
  operation,
  fichiers = [],
}: {
  dossierId: string
  cible: string
  operation: 'demander' | 'fournir' | 'valider' | 'refuser'
  fichiers?: { id: string; libelle: string }[]
}) {
  const [etat, envoyer, enCours] = useActionState(modifierComplement, {
    statut: 'inactif',
  } as EtatComplement)
  const id = useId()
  return (
    <form action={envoyer} className="mt-3 flex w-full flex-wrap items-center gap-3">
      <input type="hidden" name="dossier" value={dossierId} />
      <input type="hidden" name="cible" value={cible} />
      <input type="hidden" name="operation" value={operation} />
      {operation === 'demander' ? (
        <>
          <label htmlFor={id}>{t.motif}</label>
          <select
            id={id}
            name="motif"
            disabled={enCours}
            className="border-ink bg-paper rounded-lg border-2 px-2 py-1"
          >
            {Object.entries(t.motifs).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {operation === 'fournir' ? (
        <>
          <label htmlFor={id}>{t.remplacement}</label>
          <select
            id={id}
            name="piece"
            required
            disabled={enCours}
            defaultValue=""
            className="border-ink bg-paper max-w-full rounded-lg border-2 px-2 py-1"
          >
            <option value="" disabled>
              {t.choix}
            </option>
            {fichiers.map((f) => (
              <option key={f.id} value={f.id}>
                {f.libelle}
              </option>
            ))}
          </select>
        </>
      ) : null}
      <button disabled={enCours} className="lien-espace disabled:opacity-50">
        {enCours ? t.attente : t[operation]}
      </button>
      {etat.statut === 'erreur' ? (
        <p role="alert" className="w-full">
          {t.erreur}
        </p>
      ) : null}
      {etat.statut === 'enregistre' ? (
        <p role="status" className="w-full">
          {t.enregistre}
        </p>
      ) : null}
    </form>
  )
}
