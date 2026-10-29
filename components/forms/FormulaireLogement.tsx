'use client'

import { useActionState, useId } from 'react'

import { creerUnLogement, type EtatLogement } from '@/lib/agences/action-logements'
import { logements as texte } from '@/lib/content/logements'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatLogement = { statut: 'inactif' }

/** Creer un logement : un libelle, un loyer de reference facultatif. */
export function FormulaireLogement() {
  const [etat, envoyer, enCours] = useActionState(creerUnLogement, ETAT_INITIAL)
  const idLibelle = useId()
  const idLoyer = useId()
  const champ =
    'border-ink bg-paper w-full rounded-xl border-2 px-4 py-3 text-[15px] font-medium placeholder:text-muted placeholder:font-normal'

  return (
    <form
      action={envoyer}
      noValidate
      className="flex flex-col gap-4"
      key={etat.statut === 'enregistre' ? 'vide' : 'saisie'}
    >
      {etat.statut === 'enregistre' ? (
        <p
          role="status"
          className="bg-mint outlined rounded-xl px-4 py-3 text-[14px] font-semibold"
        >
          {texte.nouveau.succes}
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
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="min-w-0">
          <label htmlFor={idLibelle} className="mb-2 block text-[14px] font-bold">
            {texte.nouveau.libelle}
          </label>
          <input
            id={idLibelle}
            name="libelle"
            type="text"
            required
            maxLength={120}
            autoComplete="off"
            aria-describedby={`${idLibelle}-aide`}
            className={champ}
          />
          <p id={`${idLibelle}-aide`} className="text-muted mt-2 text-[13px] font-medium">
            {texte.nouveau.libelleAide}
          </p>
        </div>
        <div className="min-w-0">
          <label htmlFor={idLoyer} className="mb-2 block text-[14px] font-bold">
            {texte.nouveau.loyer}
          </label>
          <input
            id={idLoyer}
            name="loyer"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="850"
            className={champ}
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={enCours}
        className={cn(
          'press outlined bg-cobalt shadow-brut-xs min-h-11 cursor-pointer self-start rounded-[10px] px-5 py-3',
          'text-[14px] font-bold text-white disabled:cursor-wait disabled:opacity-70',
        )}
      >
        {enCours ? texte.nouveau.envoi : texte.nouveau.bouton}
      </button>
    </form>
  )
}
