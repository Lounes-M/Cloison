'use client'

import { useActionState, useId, useState, type FormEvent } from 'react'

import { fixerLeLoyer, type EtatLoyerAgence } from '@/lib/agences/action-loyer'
import { loyerAgence as texteFr } from '@/lib/content/espace'
import { lireLoyer, messageLoyer } from '@/lib/garant/validation'
import { loyerAgence as texteEn } from '@/lib/content/en/espace'
import { choisir } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'

const ETAT_INITIAL: EtatLoyerAgence = { statut: 'inactif' }

/** Fixer ou corriger le loyer d'un dossier, tant que le garant n'a pas declare. */
export function FormulaireLoyerAgence({
  dossierId,
  loyerActuel,
}: {
  dossierId: string
  loyerActuel: string
}) {
  const langue = useLangue()
  const texte = choisir(langue, texteFr, texteEn)

  const [etat, envoyer, enCours] = useActionState(fixerLeLoyer, ETAT_INITIAL)
  const [local, setLocal] = useState<string | null>(null)
  const [masquePour, setMasquePour] = useState<EtatLoyerAgence | null>(null)
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
    <form action={envoyer} noValidate onSubmit={soumettre} className="flex flex-col gap-3">
      <input type="hidden" name="dossier" value={dossierId} />
      {etat.statut === 'enregistre' ? (
        <p role="status" className="message-succes">
          {texte.succes}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="max-w-full min-w-0">
          <label htmlFor={idChamp} className="mb-2 block text-[14px] font-bold">
            {texte.champ}
          </label>
          <input
            id={idChamp}
            name="loyer"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            required
            defaultValue={etat.statut === 'erreur' ? (etat.valeur ?? '') : loyerActuel}
            placeholder="850"
            aria-invalid={erreur ? true : undefined}
            aria-describedby={erreur ? `${idChamp}-erreur` : undefined}
            onChange={() => {
              setLocal(null)
              setMasquePour(etat)
            }}
            className="border-ink bg-paper w-full max-w-[220px] rounded-xl border-2 px-4 py-3 text-[15px] font-medium"
          />
        </div>
        {erreur ? (
          <p id={`${idChamp}-erreur`} role="alert" className="message-erreur">
            {erreur}
          </p>
        ) : null}
        <button type="submit" disabled={enCours} className="btn btn-secondaire">
          {enCours ? texte.envoi : texte.bouton}
        </button>
      </div>
    </form>
  )
}
