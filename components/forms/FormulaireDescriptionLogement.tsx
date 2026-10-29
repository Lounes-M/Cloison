'use client'

import { useActionState, useId } from 'react'

import { decrireLeLogement, type EtatLogement } from '@/lib/agences/action-logements'
import { candidature } from '@/lib/content/candidature'

const ETAT_INITIAL: EtatLogement = { statut: 'inactif' }
const t = candidature.description
const champ = 'border-ink bg-paper w-full rounded-xl border-2 px-4 py-3 text-[16px] font-medium'

export type DescriptionLogement = {
  ville: string | null
  surface_m2: number | null
  pieces: number | null
  meuble: boolean | null
  disponible_le: string | null
}

/** La description publique du bien, montree sur la page du lien (0072). */
export function FormulaireDescriptionLogement({
  logementId,
  description,
}: {
  logementId: string
  description: DescriptionLogement
}) {
  const [etat, envoyer, enCours] = useActionState(decrireLeLogement, ETAT_INITIAL)
  const id = useId()

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="logement" value={logementId} />
      {etat.statut === 'erreur' ? (
        <p
          role="alert"
          className="bg-flame outlined text-ink rounded-xl px-4 py-3 text-[14px] font-semibold"
        >
          {etat.message}
        </p>
      ) : null}
      {etat.statut === 'enregistre' ? (
        <p
          role="status"
          className="bg-mint outlined rounded-xl px-4 py-3 text-[14px] font-semibold"
        >
          {t.succes}
        </p>
      ) : null}
      <div>
        <label htmlFor={`${id}-ville`} className="mb-2 block text-[14px] font-bold">
          {t.ville}
        </label>
        <input
          id={`${id}-ville`}
          name="ville"
          maxLength={80}
          defaultValue={description.ville ?? ''}
          aria-describedby={`${id}-ville-aide`}
          className={champ}
        />
        <p id={`${id}-ville-aide`} className="text-muted mt-2 text-[13px] font-medium">
          {t.villeAide}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-surface`} className="mb-2 block text-[14px] font-bold">
            {t.surface}
          </label>
          <input
            id={`${id}-surface`}
            name="surface"
            inputMode="numeric"
            defaultValue={description.surface_m2 ?? ''}
            className={champ}
          />
        </div>
        <div>
          <label htmlFor={`${id}-pieces`} className="mb-2 block text-[14px] font-bold">
            {t.pieces}
          </label>
          <input
            id={`${id}-pieces`}
            name="pieces"
            inputMode="numeric"
            defaultValue={description.pieces ?? ''}
            className={champ}
          />
        </div>
        <div>
          <label htmlFor={`${id}-meuble`} className="mb-2 block text-[14px] font-bold">
            {t.meuble}
          </label>
          <select
            id={`${id}-meuble`}
            name="meuble"
            defaultValue={description.meuble == null ? '' : description.meuble ? 'oui' : 'non'}
            className={champ}
          >
            <option value="">{t.meubleInconnu}</option>
            <option value="oui">{t.meubleOui}</option>
            <option value="non">{t.meubleNon}</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-disponible`} className="mb-2 block text-[14px] font-bold">
            {t.disponible}
          </label>
          <input
            id={`${id}-disponible`}
            name="disponible"
            type="date"
            defaultValue={description.disponible_le ?? ''}
            className={champ}
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={enCours}
        className="press outlined bg-sun rounded-brut cursor-pointer self-start px-5 py-3 text-[14px] font-bold disabled:cursor-wait disabled:opacity-70"
      >
        {enCours ? t.envoi : t.bouton}
      </button>
    </form>
  )
}
