'use client'

import { useActionState, useId } from 'react'

import { rattacherAuLogement, type EtatLogement } from '@/lib/agences/action-logements'
import { logements as texte } from '@/lib/content/logements'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatLogement = { statut: 'inactif' }

/** Rattacher le dossier a un logement de l'agence, ou l'en detacher. */
export function FormulaireRattachementLogement({
  dossierId,
  actuel,
  options,
}: {
  dossierId: string
  actuel: string | null
  options: { id: string; libelle: string }[]
}) {
  const [etat, envoyer, enCours] = useActionState(rattacherAuLogement, ETAT_INITIAL)
  const idChamp = useId()

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <input type="hidden" name="dossier" value={dossierId} />
      {etat.statut === 'enregistre' ? (
        <p
          role="status"
          className="bg-mint outlined rounded-xl px-4 py-2 text-[14px] font-semibold"
        >
          {texte.rattachement.succes}
        </p>
      ) : null}
      {etat.statut === 'erreur' ? (
        <p
          role="alert"
          className="bg-flame outlined text-ink rounded-xl px-4 py-2 text-[14px] font-semibold"
        >
          {etat.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="max-w-full min-w-0">
          <label htmlFor={idChamp} className="mb-2 block text-[14px] font-bold">
            {texte.rattachement.champ}
          </label>
          <select
            id={idChamp}
            name="logement"
            defaultValue={actuel ?? ''}
            className="border-ink bg-paper w-full max-w-[320px] rounded-xl border-2 px-4 py-3 text-[15px] font-medium"
          >
            <option value="">{texte.rattachement.aucun}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.libelle}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={enCours}
          className={cn(
            'press outlined bg-paper shadow-brut-xs min-h-11 cursor-pointer rounded-[10px] px-5 py-3',
            'text-[14px] font-bold disabled:cursor-wait disabled:opacity-70',
          )}
        >
          {enCours ? texte.rattachement.envoi : texte.rattachement.bouton}
        </button>
      </div>
    </form>
  )
}
