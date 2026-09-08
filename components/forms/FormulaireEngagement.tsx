'use client'

import { useActionState, useId } from 'react'

import { engagement as texte } from '@/lib/content/garant'
import { conditionsEngagement } from '@/lib/content/conditions-engagement'
import { declarerMonEngagement, type EtatEngagement } from '@/lib/garant/action-engagement'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatEngagement = { statut: 'inactif' }

const champBase =
  'w-full rounded-xl border-2 border-ink bg-paper px-4 py-3 text-[15px] font-medium ' +
  'placeholder:text-muted placeholder:font-normal'

export type EngagementAffiche = {
  couvre: 'loyer' | 'loyer_charges'
  montant: string
  jusquAu: string
  solidaire: boolean
  revenu: string
} | null

/**
 * Ce que le garant couvre, et ce qu'il gagne.
 *
 * Cinq champs, et aucun n'est le ratio : il est calcule, jamais saisi. Le
 * revenu declare est ce qu'on divise par le loyer ; les pieces en sont la
 * preuve, que l'agence verifie. Le montant maximum, lui, est libre : un
 * plafond est un choix du garant, pas une consequence des pieces.
 */
export function FormulaireEngagement({
  actuel,
  dossierId,
  version,
}: {
  actuel: EngagementAffiche
  dossierId: string
  version: number
}) {
  const [etat, envoyer, enCours] = useActionState(declarerMonEngagement, ETAT_INITIAL)
  const id = useId()

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="dossier" value={dossierId ?? ''} />
      <input type="hidden" name="versionConditions" value={version} />
      <p className="text-muted text-[13px] font-medium">{conditionsEngagement.modification}</p>
      {etat.statut === 'enregistre' ? (
        <p
          role="status"
          className="bg-mint outlined rounded-xl px-4 py-3 text-[14px] font-semibold"
        >
          {texte.succes}
        </p>
      ) : null}
      {etat.statut === 'erreur' ? (
        <p
          role="alert"
          className="bg-flame outlined text-ink rounded-xl px-4 py-3 text-[14px] font-semibold"
        >
          {etat.message}
        </p>
      ) : null}

      <div>
        <label htmlFor={`${id}-revenu`} className="mb-2 block text-[14px] font-bold">
          {texte.revenu}
        </label>
        <input
          id={`${id}-revenu`}
          name="revenu"
          type="text"
          inputMode="decimal"
          defaultValue={actuel?.revenu ?? ''}
          placeholder="3 200"
          aria-describedby={`${id}-revenu-aide`}
          className={cn(champBase)}
        />
        <p id={`${id}-revenu-aide`} className="text-muted mt-2 text-[13px] font-medium">
          {texte.revenuAide}
        </p>
      </div>

      <fieldset>
        <legend className="mb-2 block text-[14px] font-bold">{texte.couvre}</legend>
        <div className="flex flex-col gap-2">
          {texte.couvreOptions.map((option) => (
            <label
              key={option.valeur}
              className="flex cursor-pointer items-center gap-3 text-[15px] font-medium"
            >
              <input
                type="radio"
                name="couvre"
                value={option.valeur}
                defaultChecked={(actuel?.couvre ?? 'loyer_charges') === option.valeur}
                className="accent-cobalt size-4"
              />
              {option.libelle}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${id}-montant`} className="mb-2 block text-[14px] font-bold">
          {texte.montant}
        </label>
        <input
          id={`${id}-montant`}
          name="montant"
          type="text"
          inputMode="decimal"
          defaultValue={actuel?.montant ?? ''}
          placeholder="1 200"
          aria-describedby={`${id}-montant-aide`}
          className={cn(champBase)}
        />
        <p id={`${id}-montant-aide`} className="text-muted mt-2 text-[13px] font-medium">
          {texte.montantAide}
        </p>
      </div>

      <div>
        <label htmlFor={`${id}-jusquau`} className="mb-2 block text-[14px] font-bold">
          {texte.jusquAu}
        </label>
        <input
          id={`${id}-jusquau`}
          name="jusquAu"
          type="date"
          defaultValue={actuel?.jusquAu ?? ''}
          aria-describedby={`${id}-jusquau-aide`}
          className={cn(champBase)}
        />
        <p id={`${id}-jusquau-aide`} className="text-muted mt-2 text-[13px] font-medium">
          {texte.jusquAuAide}
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="solidaire"
          defaultChecked={actuel?.solidaire ?? true}
          className="accent-cobalt mt-1 size-4"
        />
        <span>
          <span className="block text-[14px] font-bold">{texte.solidaire}</span>
          <span className="text-muted block text-[13px] font-medium">{texte.solidaireAide}</span>
        </span>
      </label>

      <button
        type="submit"
        disabled={enCours}
        className={cn(
          'press outlined bg-cobalt shadow-brut rounded-brut cursor-pointer self-start px-8 py-4',
          'text-[17px] font-bold text-white disabled:cursor-wait disabled:opacity-70',
        )}
      >
        {enCours ? texte.envoi : texte.bouton}
      </button>
    </form>
  )
}
