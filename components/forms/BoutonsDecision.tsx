'use client'

import { useActionState } from 'react'

import { dossier as texte } from '@/lib/content/espace'
import { prendreLeDossier, refuserLeDossier, type EtatDecision } from '@/lib/agences/action-dossier'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatDecision = { statut: 'inactif' }

/**
 * Prendre ou refuser.
 *
 * Deux formulaires et non un seul avec deux boutons : un lecteur d'ecran
 * annonce alors deux actions distinctes, et un double clic ne peut pas
 * envoyer l'autre.
 */
export function BoutonsDecision({
  dossierId,
  peutPrendre,
  peutRefuser,
}: {
  dossierId: string
  peutPrendre: boolean
  peutRefuser: boolean
}) {
  const [prise, prendre, priseEnCours] = useActionState(prendreLeDossier, ETAT_INITIAL)
  const [refus, refuser, refusEnCours] = useActionState(refuserLeDossier, ETAT_INITIAL)

  return (
    <div className="flex flex-col gap-4">
      {prise.statut === 'erreur' || refus.statut === 'erreur' ? (
        <p className="bg-flame outlined rounded-xl px-4 py-3 text-[14px] font-semibold text-white">
          {prise.statut === 'erreur'
            ? prise.message
            : refus.statut === 'erreur'
              ? refus.message
              : ''}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-6">
        <form action={prendre} className="flex flex-col gap-2">
          <input type="hidden" name="dossier" value={dossierId} />
          <button
            type="submit"
            disabled={!peutPrendre || priseEnCours}
            className={cn(
              'press outlined bg-cobalt shadow-brut rounded-brut cursor-pointer px-8 py-4',
              'text-[17px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {texte.prendre}
          </button>
          <p className="text-muted max-w-[280px] text-[12px] font-medium">{texte.prendreAide}</p>
        </form>

        <form action={refuser} className="flex flex-col gap-2">
          <input type="hidden" name="dossier" value={dossierId} />
          <button
            type="submit"
            disabled={!peutRefuser || refusEnCours}
            className={cn(
              'press outlined bg-paper shadow-brut rounded-brut cursor-pointer px-8 py-4',
              'text-flame text-[17px] font-bold disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {texte.refuser}
          </button>
          <p className="text-muted max-w-[280px] text-[12px] font-medium">{texte.refuserAide}</p>
        </form>
      </div>
    </div>
  )
}
