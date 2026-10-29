'use client'

import { useActionState, useId } from 'react'

import { tableau } from '@/lib/content/espace'
import { ouvrirUnDossier, type EtatNouveauDossier } from '@/lib/agences/action-dossier'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatNouveauDossier = { statut: 'inactif' }

/** L'agence ouvre un dossier : une adresse, le locataire recoit son lien. */
export function FormulaireNouveauDossier({
  verifiee,
  logementId,
  loyerParDefaut = '',
}: {
  verifiee: boolean
  logementId?: string
  loyerParDefaut?: string
}) {
  const [etat, envoyer, enCours] = useActionState(ouvrirUnDossier, ETAT_INITIAL)
  const idChamp = useId()
  const idLoyer = useId()

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-4">
      {logementId ? <input type="hidden" name="logement" value={logementId} /> : null}
      {etat.statut === 'ouvert' ? (
        <p
          role="status"
          className="bg-mint outlined rounded-xl px-4 py-3 text-[14px] font-semibold"
        >
          {tableau.nouveauSucces(etat.email)}
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

      <div>
        <label htmlFor={idLoyer} className="mb-2 block text-[14px] font-bold">
          {tableau.nouveauLoyer}
        </label>
        <input
          id={idLoyer}
          name="loyer"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={!verifiee}
          defaultValue={etat.statut === 'erreur' ? (etat.loyer ?? '') : loyerParDefaut}
          placeholder="850"
          className={cn(
            'border-ink bg-paper w-full max-w-[220px] rounded-xl border-2 px-4 py-3 text-[15px] font-medium',
            'placeholder:text-muted placeholder:font-normal disabled:opacity-50',
          )}
        />
        <p className="text-muted mt-2 text-[13px] font-medium">{tableau.nouveauLoyerAide}</p>
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
