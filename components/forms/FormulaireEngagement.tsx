'use client'

import { BrouillonEngagement } from './BrouillonEngagement'
import { LectureRevenus } from './LectureRevenus'
import { useActionState, useId, useRef, useState } from 'react'

import {
  engagement as texteFr,
  profilsRessources as profilsRessourcesFr,
  type ProfilRessources,
} from '@/lib/content/garant'
import { conditionsEngagement as conditionsEngagementFr } from '@/lib/content/conditions-engagement'
import { declarerMonEngagement, type EtatEngagement } from '@/lib/garant/action-engagement'
import { cn } from '@/lib/utils'
import {
  engagement as texteEn,
  profilsRessources as profilsRessourcesEn,
} from '@/lib/content/en/garant'
import { conditionsEngagement as conditionsEngagementEn } from '@/lib/content/en/conditions-engagement'
import { choisir } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'

const ETAT_INITIAL: EtatEngagement = { statut: 'inactif' }

const champBase =
  'w-full rounded-xl border-2 border-ink bg-paper px-4 py-3 text-[15px] font-medium ' +
  'placeholder:text-muted placeholder:font-normal'

export type EngagementAffiche = {
  profil?: ProfilRessources
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
  lectureIa = false,
}: {
  actuel: EngagementAffiche
  dossierId: string
  version: number
  /** Activee cote serveur et au moins un bulletin ou une pension deposes. */
  lectureIa?: boolean
}) {
  const langue = useLangue()
  const conditionsEngagement = choisir(langue, conditionsEngagementFr, conditionsEngagementEn)
  const texte = choisir(langue, texteFr, texteEn)
  const profilsRessources = choisir(langue, profilsRessourcesFr, profilsRessourcesEn)

  const [etat, envoyer, enCours] = useActionState(declarerMonEngagement, ETAT_INITIAL)
  const id = useId()
  const formulaire = useRef<HTMLFormElement>(null)
  const champRevenu = useRef<HTMLInputElement>(null)
  const [brouillonEnCours, setBrouillonEnCours] = useState(false)

  return (
    <form ref={formulaire} action={envoyer} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="dossier" value={dossierId ?? ''} />
      <input type="hidden" name="versionConditions" value={version} />
      <p className="text-muted text-[13px] font-medium">{conditionsEngagement.modification}</p>
      <div>
        <label htmlFor={`${id}-profil`} className="mb-2 block text-[14px] font-bold">
          {texte.profil}
        </label>
        <select
          id={`${id}-profil`}
          name="profil"
          defaultValue={actuel?.profil ?? 'salarie'}
          className={champBase}
          aria-describedby={`${id}-profil-aide`}
        >
          {profilsRessources.map((profil) => (
            <option key={profil.valeur} value={profil.valeur}>
              {profil.libelle}
            </option>
          ))}
        </select>
        <p id={`${id}-profil-aide`} className="text-muted mt-2 text-[13px] font-medium">
          {texte.profilAide}
        </p>
      </div>
      {etat.statut === 'enregistre' ? (
        <p role="status" className="message-succes">
          {texte.succes}
        </p>
      ) : null}
      {etat.statut === 'erreur' ? (
        <p role="alert" className="message-erreur">
          {etat.message}
        </p>
      ) : null}

      <div>
        <label htmlFor={`${id}-revenu`} className="mb-2 block text-[14px] font-bold">
          {texte.revenu}
        </label>
        <input
          ref={champRevenu}
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
        {lectureIa ? (
          <LectureRevenus
            dossierId={dossierId}
            reporterDansLeChamp={(saisie) => {
              const champ = champRevenu.current
              if (!champ) return
              champ.value = saisie
              champ.dispatchEvent(new Event('input', { bubbles: true }))
              champ.focus()
            }}
          />
        ) : null}
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
        disabled={enCours || brouillonEnCours}
        className="btn btn-principal btn-grand self-start"
      >
        {enCours ? texte.envoi : texte.bouton}
      </button>
      <BrouillonEngagement
        key={version}
        formulaire={formulaire}
        indisponible={enCours}
        attente={setBrouillonEnCours}
      />
    </form>
  )
}
