'use client'

import { useActionState, useId } from 'react'

import { attribuerLeLogement, type EtatAttribution } from '@/lib/agences/action-logements'
import { logements as texteFr } from '@/lib/content/logements'
import { logements as texteEn } from '@/lib/content/en/logements'
import { choisir } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'

const ETAT_INITIAL: EtatAttribution = { statut: 'inactif' }

/**
 * Attribuer le logement au candidat retenu.
 *
 * La case a cocher dit ce qui va partir : un refus pour chaque autre
 * candidat complet ou pris. L'action la verifie aussi.
 */
export function FormulaireAttributionLogement({
  logementId,
  retenus,
}: {
  logementId: string
  retenus: { id: string; reference: string }[]
}) {
  const langue = useLangue()
  const texte = choisir(langue, texteFr, texteEn)

  const [etat, envoyer, enCours] = useActionState(attribuerLeLogement, ETAT_INITIAL)
  const idChamp = useId()
  const idCase = useId()

  if (etat.statut === 'attribue') {
    return (
      <p role="status" className="message-succes">
        {texte.attribution.succes(etat.refuses, etat.enCours)}
      </p>
    )
  }

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="logement" value={logementId} />
      {etat.statut === 'erreur' ? (
        <p role="alert" className="message-erreur">
          {etat.message}
        </p>
      ) : null}
      <div className="max-w-full min-w-0">
        <label htmlFor={idChamp} className="mb-2 block text-[14px] font-bold">
          {texte.attribution.champ}
        </label>
        <select
          id={idChamp}
          name="dossier"
          defaultValue={retenus[0]?.id}
          className="border-ink bg-paper w-full max-w-[320px] rounded-xl border-2 px-4 py-3 text-[15px] font-medium"
        >
          {retenus.map((r) => (
            <option key={r.id} value={r.id}>
              {r.reference}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-start gap-3">
        <input
          id={idCase}
          name="confirme"
          value="oui"
          type="checkbox"
          required
          className="accent-ink mt-1 size-5 shrink-0"
        />
        <label htmlFor={idCase} className="text-[14px] font-semibold">
          {texte.attribution.confirmation}
        </label>
      </div>
      <div>
        <button type="submit" disabled={enCours} className="btn btn-secondaire">
          {enCours ? texte.attribution.envoi : texte.attribution.bouton}
        </button>
      </div>
    </form>
  )
}
