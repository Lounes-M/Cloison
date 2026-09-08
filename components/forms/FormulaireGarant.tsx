'use client'

import { useActionState, useId } from 'react'

import { espace } from '@/lib/content/locataire'
import { designerMonGarant, type EtatGarant } from '@/lib/locataire/action-garant'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatGarant = { statut: 'inactif' }

/**
 * Designer son garant, ou lui renvoyer son lien.
 *
 * Le meme formulaire sert aux deux : renvoyer, c'est reemettre, et reemettre
 * revoque le lien precedent. Il n'y a donc pas de bouton « renvoyer » separe
 * qui laisserait croire que l'ancien lien vaut encore.
 */
export function FormulaireGarant({
  dossierId,
  garantActuel,
  verrouille = false,
}: {
  dossierId: string
  garantActuel: string | null
  verrouille?: boolean
}) {
  const [etat, envoyer, enCours] = useActionState(designerMonGarant, ETAT_INITIAL)
  const idChamp = useId()

  const valeurInitiale = etat.statut === 'erreur' ? (etat.valeur ?? '') : (garantActuel ?? '')

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="dossier" value={dossierId ?? ''} />
      {etat.statut === 'envoye' ? (
        <p
          role="status"
          className="bg-mint outlined rounded-xl px-4 py-3 text-[14px] font-semibold"
        >
          {espace.garantSucces}
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
          {espace.garantChamp}
        </label>
        <input
          id={idChamp}
          name="courriel"
          type="email"
          autoComplete="off"
          required
          defaultValue={valeurInitiale}
          readOnly={verrouille}
          placeholder="garant@exemple.fr"
          aria-describedby={`${idChamp}-aide`}
          className={cn(
            'border-ink bg-paper w-full rounded-xl border-2 px-4 py-3 text-[15px] font-medium',
            'placeholder:text-muted placeholder:font-normal',
          )}
        />
        <p id={`${idChamp}-aide`} className="text-muted mt-2 text-[13px] font-medium">
          {espace.garantAide}
        </p>
      </div>

      <button
        type="submit"
        disabled={enCours}
        className={cn(
          'press outlined bg-cobalt shadow-brut rounded-brut cursor-pointer px-8 py-4',
          'text-[17px] font-bold text-white disabled:cursor-wait disabled:opacity-70',
        )}
      >
        {enCours ? espace.garantEnvoi : garantActuel ? espace.garantRenvoyer : espace.garantBouton}
      </button>
    </form>
  )
}
