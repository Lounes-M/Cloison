'use client'

import Link from 'next/link'
import { useActionState, useId } from 'react'

import { cloture as texte, dossier as texteDossier } from '@/lib/content/espace'
import { cloreLeDossier, type EtatCloture } from '@/lib/agences/action-cloture'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatCloture = { statut: 'inactif' }

/**
 * Clore un dossier avant son echeance.
 *
 * La reference retapee evite le clic par megarde ; la base la verifie aussi.
 * Apres succes, la page du dossier n'est plus lisible : seul le retour a la
 * liste est propose.
 */
export function FormulaireCloture({
  dossierId,
  reference,
}: {
  dossierId: string
  reference: string
}) {
  const [etat, envoyer, enCours] = useActionState(cloreLeDossier, ETAT_INITIAL)
  const idChamp = useId()
  const idAide = useId()

  if (etat.statut === 'clos') {
    return (
      <div className="flex flex-col gap-3">
        <p
          role="status"
          className="bg-mint outlined rounded-xl px-4 py-3 text-[14px] font-semibold"
        >
          {texte.succes(etat.reference)}
        </p>
        <Link
          href="/espace"
          className="text-cobalt text-[14px] font-bold underline underline-offset-2"
        >
          {texteDossier.retour}
        </Link>
      </div>
    )
  }

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="dossier" value={dossierId} />
      {etat.statut === 'erreur' ? (
        <p
          role="alert"
          className="bg-flame outlined text-ink rounded-xl px-4 py-3 text-[14px] font-semibold"
        >
          {etat.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="max-w-full min-w-0">
          <label htmlFor={idChamp} className="mb-2 block text-[14px] font-bold">
            {texte.champ(reference)}
          </label>
          <input
            id={idChamp}
            name="reference"
            type="text"
            required
            autoComplete="off"
            spellCheck={false}
            aria-describedby={idAide}
            className="border-ink bg-paper w-full max-w-[260px] rounded-xl border-2 px-4 py-3 text-[15px] font-medium"
          />
        </div>
        <button
          type="submit"
          disabled={enCours}
          className={cn(
            'press outlined bg-paper shadow-brut-xs min-h-11 cursor-pointer rounded-[10px] px-5 py-3',
            'text-flame-texte text-[14px] font-bold disabled:cursor-wait disabled:opacity-70',
          )}
        >
          {enCours ? texte.envoi : texte.bouton}
        </button>
      </div>
      <p id={idAide} className="text-muted text-[12px] font-medium">
        {texte.reserve}
      </p>
    </form>
  )
}
