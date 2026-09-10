'use client'
import { useActionState, useId } from 'react'
import { affecterDossier, type EtatResponsable } from '@/lib/agences/action-responsable'
import { responsables as t, type ResponsableDossier } from '@/lib/content/responsables'
export function FormulaireResponsable({
  dossierId,
  courant,
  admin,
  utilisateurId,
  choix,
}: {
  dossierId: string
  courant: ResponsableDossier
  admin: boolean
  utilisateurId: string
  choix: { id: string; email: string }[]
}) {
  const [etat, envoyer, attente] = useActionState(affecterDossier, {
    statut: 'inactif',
  } as EtatResponsable)
  const id = useId(),
    moi = courant.responsable_id === utilisateurId
  if (!admin && courant.responsable_id && !moi) return <p className="mt-3 text-sm">{t.membre}</p>
  return (
    <form action={envoyer} className="mt-4 grid min-w-0 gap-3">
      <input type="hidden" name="dossier" value={dossierId} />
      <input type="hidden" name="revision" value={courant.revision ?? ''} />
      {admin ? (
        <>
          <label htmlFor={id}>{t.choix}</label>
          <select
            key={courant.revision ?? 'nouveau'}
            id={id}
            name="membre"
            disabled={attente}
            defaultValue={courant.responsable_email ? (courant.responsable_id ?? '') : ''}
            className="outlined bg-paper w-full min-w-0 rounded-lg px-3 py-2"
          >
            <option value="">{t.aucun}</option>
            {choix.map((c) => (
              <option key={c.id} value={c.id}>
                {c.email}
              </option>
            ))}
          </select>
        </>
      ) : (
        <input type="hidden" name="membre" value={moi ? '' : utilisateurId} />
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmation" required disabled={attente} />
        {t.confirmation}
      </label>
      <button
        disabled={attente}
        className="outlined bg-sky rounded-lg px-4 py-2 font-bold disabled:opacity-50"
      >
        {attente ? t.attente : admin ? t.enregistrer : moi ? t.liberer : t.prendre}
      </button>
      {!attente && etat.statut === 'erreur' ? (
        <p role="alert">{t.erreur}</p>
      ) : !attente && etat.statut === 'enregistre' ? (
        <p role="status">{t.succes}</p>
      ) : null}
    </form>
  )
}
