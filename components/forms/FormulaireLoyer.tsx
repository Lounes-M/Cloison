'use client'

import { useActionState, useId, useState, type FormEvent } from 'react'

import { espace as espaceFr } from '@/lib/content/locataire'
import { lireLoyer, messageLoyer } from '@/lib/garant/validation'
import { saisirMonLoyer, type EtatLoyer } from '@/lib/locataire/action-loyer'
import { cn } from '@/lib/utils'
import { espace as espaceEn } from '@/lib/content/en/locataire'
import { choisir } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'

const ETAT_INITIAL: EtatLoyer = { statut: 'inactif' }

/** Un champ, un bouton : le loyer, charges comprises. */
export function FormulaireLoyer({
  loyerActuel,
  dossierId,
}: {
  loyerActuel: string
  dossierId: string
}) {
  const langue = useLangue()
  const espace = choisir(langue, espaceFr, espaceEn)

  const [etat, envoyer, enCours] = useActionState(saisirMonLoyer, ETAT_INITIAL)
  const [local, setLocal] = useState<string | null>(null)
  const [masquePour, setMasquePour] = useState<EtatLoyer | null>(null)
  const idChamp = useId()
  const erreur = local ?? (masquePour !== etat && etat.statut === 'erreur' ? etat.message : null)

  function soumettre(event: FormEvent<HTMLFormElement>) {
    const saisie = String(new FormData(event.currentTarget).get('loyer') ?? '')
    const lu = lireLoyer(saisie)
    if (!lu.ok || lu.cents === null) {
      event.preventDefault()
      setLocal(messageLoyer(!lu.ok ? lu.motif : 'illisible', langue))
      setMasquePour(etat)
      return
    }
    setLocal(null)
    setMasquePour(etat)
  }

  return (
    <form action={envoyer} noValidate onSubmit={soumettre} className="flex flex-col gap-4">
      <input type="hidden" name="dossier" value={dossierId ?? ''} />
      {etat.statut === 'enregistre' && !local ? (
        <p role="status" className="message-succes">
          {espace.loyerSucces}
        </p>
      ) : null}

      <div>
        <label htmlFor={idChamp} className="mb-2 block text-[14px] font-bold">
          {espace.loyerChamp}
        </label>
        <div className="flex items-center gap-3">
          <input
            id={idChamp}
            name="loyer"
            type="text"
            inputMode="decimal"
            required
            defaultValue={etat.statut === 'erreur' ? (etat.valeur ?? '') : loyerActuel}
            placeholder="850"
            aria-invalid={erreur ? true : undefined}
            aria-describedby={erreur ? `${idChamp}-erreur` : undefined}
            onChange={() => {
              setLocal(null)
              setMasquePour(etat)
            }}
            className={cn(
              'border-ink bg-paper w-full rounded-xl border-2 px-4 py-3 text-[15px] font-medium',
              'placeholder:text-muted placeholder:font-normal',
            )}
          />
          <span className="text-[15px] font-bold">€</span>
        </div>
        {erreur ? (
          <p id={`${idChamp}-erreur`} role="alert" className="message-erreur mt-2">
            {erreur}
          </p>
        ) : null}
      </div>

      <button type="submit" disabled={enCours} className="btn btn-principal self-start">
        {enCours ? espace.loyerEnvoi : espace.loyerBouton}
      </button>
    </form>
  )
}
