'use client'

import { useActionState, useId } from 'react'

import { nommerAgence, type EtatNomAgence } from '@/lib/agences/action-rattachement'
import { rattachement } from '@/lib/content/rattachement'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatNomAgence = { statut: 'inactif' }

/**
 * La derniere etape de la premiere connexion, et seulement pour la premiere
 * personne d'un domaine.
 *
 * Celles qui suivront ne verront jamais cet ecran : leur agence existe deja, et
 * son nom ne leur appartient pas.
 */
export function FormulaireNomAgence({ domaine }: { domaine: string }) {
  const [etat, envoyer, enCours] = useActionState(nommerAgence, ETAT_INITIAL)
  const idChamp = useId()

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-5">
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
          {rattachement.nomRequis.libelle}
        </label>
        <input
          id={idChamp}
          name="nom"
          type="text"
          required
          minLength={2}
          maxLength={120}
          autoComplete="organization"
          defaultValue={etat.statut === 'erreur' ? etat.valeur : ''}
          placeholder="Agence du Vieux Port"
          aria-describedby={`${idChamp}-aide`}
          className={cn(
            'border-ink bg-paper w-full rounded-xl border-2 px-4 py-3 text-[15px] font-medium',
            'placeholder:text-muted placeholder:font-normal',
          )}
        />
        <p id={`${idChamp}-aide`} className="text-muted mt-2 text-[13px] font-medium">
          <strong className="text-ink">{rattachement.nomRequis.premier(domaine)}</strong>{' '}
          {rattachement.nomRequis.aide}
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
        {enCours ? rattachement.nomRequis.envoi : rattachement.nomRequis.bouton}
      </button>
    </form>
  )
}
