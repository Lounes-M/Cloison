'use client'

import { useActionState, useId } from 'react'

import { tableau } from '@/lib/content/espace'
import { ouvrirUnDossier, type EtatNouveauDossier } from '@/lib/agences/action-dossier'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatNouveauDossier = { statut: 'inactif' }

/** L'agence ouvre un dossier : une adresse, le locataire recoit son lien. */
export function FormulaireNouveauDossier({ verifiee }: { verifiee: boolean }) {
  const [etat, envoyer, enCours] = useActionState(ouvrirUnDossier, ETAT_INITIAL)
  const idChamp = useId()

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-4">
      {etat.statut === 'ouvert' ? (
        <p className="bg-mint outlined rounded-xl px-4 py-3 text-[14px] font-semibold">
          {tableau.nouveauSucces(etat.email)}
        </p>
      ) : null}
      {etat.statut === 'erreur' ? (
        <p className="bg-flame outlined rounded-xl px-4 py-3 text-[14px] font-semibold text-white">
          {etat.message}
        </p>
      ) : null}

      <div>
        <label htmlFor={idChamp} className="mb-2 block text-[14px] font-bold">
          {tableau.nouveauChamp}
        </label>
        <input
          id={idChamp}
          name="courriel"
          type="email"
          autoComplete="off"
          required
          disabled={!verifiee}
          defaultValue={etat.statut === 'erreur' ? (etat.valeur ?? '') : ''}
          placeholder="locataire@exemple.fr"
          className={cn(
            'border-ink bg-paper w-full rounded-xl border-2 px-4 py-3 text-[15px] font-medium',
            'placeholder:text-muted placeholder:font-normal disabled:opacity-50',
          )}
        />
        <p className="text-muted mt-2 text-[13px] font-medium">{tableau.nouveauAide}</p>
      </div>

      <button
        type="submit"
        disabled={enCours || !verifiee}
        className={cn(
          'press outlined bg-cobalt shadow-brut rounded-brut cursor-pointer self-start px-8 py-4',
          'text-[17px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {enCours ? tableau.nouveauEnvoi : tableau.nouveauBouton}
      </button>
    </form>
  )
}
