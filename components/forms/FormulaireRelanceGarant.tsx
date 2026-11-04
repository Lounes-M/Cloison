'use client'

import { useActionState } from 'react'

import { relancerLeGarant, type EtatRelance } from '@/lib/agences/action-relance'
import { relanceGarant as texte } from '@/lib/content/espace'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatRelance = { statut: 'inactif' }

/** Ouvrir un nouveau cycle de relances quand les trois premieres sont restees sans reponse. */
export function FormulaireRelanceGarant({ dossierId }: { dossierId: string }) {
  const [etat, envoyer, enCours] = useActionState(relancerLeGarant, ETAT_INITIAL)

  if (etat.statut === 'relance') {
    return (
      <p role="status" className="bg-mint outlined rounded-xl px-4 py-3 text-[14px] font-semibold">
        {texte.succes}
      </p>
    )
  }

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <input type="hidden" name="dossier" value={dossierId} />
      <p className="text-muted text-[14px] leading-relaxed font-medium">{texte.aide}</p>
      {etat.statut === 'erreur' ? (
        <p
          role="alert"
          className="bg-flame outlined text-ink rounded-xl px-4 py-3 text-[14px] font-semibold"
        >
          {etat.message}
        </p>
      ) : null}
      <div>
        <button
          type="submit"
          disabled={enCours}
          className={cn(
            'press outlined bg-paper shadow-brut-xs min-h-11 cursor-pointer rounded-[10px] px-5 py-3',
            'text-[14px] font-bold disabled:cursor-wait disabled:opacity-70',
          )}
        >
          {enCours ? texte.envoi : texte.bouton}
        </button>
      </div>
    </form>
  )
}
