'use client'

import { useActionState, useId } from 'react'

import { useLangue } from '@/components/langue/LangueContexte'
import {
  reglerGarantCommun,
  reglerSolvabilite,
  type EtatReglage,
} from '@/lib/agences/action-colocation'
import { colocation as texteFr } from '@/lib/content/colocation'
import { colocation as texteEn } from '@/lib/content/en/colocation'
import { choisir } from '@/lib/i18n'

const INACTIF: EtatReglage = { statut: 'inactif' }
const CHAMP =
  'border-ink bg-paper w-full rounded-xl border-2 px-4 py-3 text-[15px] font-medium disabled:opacity-50'

function Retour({ etat, fait }: { etat: EtatReglage; fait: string }) {
  if (etat.statut === 'fait')
    return (
      <p role="status" className="message-succes">
        {fait}
      </p>
    )
  if (etat.statut === 'erreur')
    return (
      <p role="alert" className="message-erreur">
        {etat.message}
      </p>
    )
  return null
}

/**
 * L'agence choisit de juger les garants ensemble ou chacun seul (0094). Le
 * mode commun n'est propose que sur un bail solidaire ; la base refuse le
 * reste, et tout changement une fois un dossier pris.
 */
export function FormulaireSolvabilite({
  colocationId,
  actuelle,
  solidaire,
}: {
  colocationId: string
  actuelle: 'individuelle' | 'commune'
  solidaire: boolean
}) {
  const t = choisir(useLangue(), texteFr, texteEn)
  const [etat, envoyer, enCours] = useActionState(reglerSolvabilite, INACTIF)

  if (!solidaire) {
    return <p className="text-muted text-[14px] font-medium">{t.reglages.communIndisponible}</p>
  }
  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <input type="hidden" name="colocation" value={colocationId} />
      <Retour etat={etat} fait={t.reglages.fait} />
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">{t.reglages.solvabilite}</legend>
        {(['individuelle', 'commune'] as const).map((valeur) => (
          <label key={valeur} className="flex items-start gap-3 text-[14px] font-medium">
            <input
              type="radio"
              name="solvabilite"
              value={valeur}
              defaultChecked={valeur === actuelle}
              className="mt-1"
            />
            <span>{t.solvabilites[valeur]}</span>
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={enCours} className="btn btn-secondaire self-start">
        {enCours ? t.reglages.envoi : t.reglages.bouton}
      </button>
    </form>
  )
}

/** L'agence dit combien de colocataires couvre le garant d'un dossier (0094). */
export function FormulaireGarantCommun({
  colocationId,
  dossiers,
}: {
  colocationId: string
  dossiers: { id: string; libelle: string; garantis: number }[]
}) {
  const t = choisir(useLangue(), texteFr, texteEn)
  const [etat, envoyer, enCours] = useActionState(reglerGarantCommun, INACTIF)
  const idDossier = useId()
  const idGarantis = useId()

  return (
    <form action={envoyer} className="flex flex-col gap-4">
      <input type="hidden" name="colocation" value={colocationId} />
      <Retour etat={etat} fait={t.reglages.fait} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={idDossier} className="mb-2 block text-[14px] font-bold">
            {t.reglages.dossier}
          </label>
          <select id={idDossier} name="dossier" required className={CHAMP}>
            {dossiers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.libelle}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={idGarantis} className="mb-2 block text-[14px] font-bold">
            {t.reglages.garantis}
          </label>
          <select id={idGarantis} name="garantis" required defaultValue="2" className={CHAMP}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button type="submit" disabled={enCours} className="btn btn-secondaire self-start">
        {enCours ? t.reglages.envoi : t.reglages.bouton}
      </button>
    </form>
  )
}
