'use client'

import { useActionState, useId } from 'react'

import { secondGarant as texte } from '@/lib/content/locataire'
import { designerSecondGarant, type EtatSecondGarant } from '@/lib/locataire/action-second-garant'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatSecondGarant = { statut: 'inactif' }

/**
 * Designer un second garant, ou lui renvoyer son lien.
 *
 * Comme pour le premier, renvoyer c'est reemettre : l'ancien lien cesse de
 * valoir. L'adresse d'un second garant deja invite ne se change pas.
 */
export function FormulaireSecondGarant({
  dossierId,
  secondActuel,
}: {
  dossierId: string
  secondActuel: string | null
}) {
  const [etat, envoyer, enCours] = useActionState(designerSecondGarant, ETAT_INITIAL)
  const idChamp = useId()
  const valeurInitiale = etat.statut === 'erreur' ? (etat.valeur ?? '') : (secondActuel ?? '')

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="dossier" value={dossierId} />
      {etat.statut === 'envoye' ? (
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
        <label htmlFor={idChamp} className="mb-2 block text-[14px] font-bold">
          {texte.champ}
        </label>
        <input
          id={idChamp}
          name="courriel"
          type="email"
          autoComplete="off"
          required
          defaultValue={valeurInitiale}
          readOnly={Boolean(secondActuel)}
          placeholder="garant@exemple.fr"
          className={cn(
            'border-ink bg-paper w-full rounded-xl border-2 px-4 py-3 text-[15px] font-medium',
            'placeholder:text-muted placeholder:font-normal',
          )}
        />
      </div>
      <button
        type="submit"
        disabled={enCours}
        className={cn(
          'press outlined bg-paper shadow-brut-xs cursor-pointer rounded-[10px] px-6 py-3',
          'text-[15px] font-bold disabled:cursor-wait disabled:opacity-70',
        )}
      >
        {enCours ? texte.envoi : secondActuel ? texte.renvoyer : texte.bouton}
      </button>
    </form>
  )
}
