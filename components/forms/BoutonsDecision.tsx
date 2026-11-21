'use client'

import { useActionState } from 'react'

import { dossier as texteFr } from '@/lib/content/espace'
import { prendreLeDossier, refuserLeDossier, type EtatDecision } from '@/lib/agences/action-dossier'
import { dossier as texteEn } from '@/lib/content/en/espace'
import { choisir } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'

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
  const langue = useLangue()
  const texte = choisir(langue, texteFr, texteEn)

  const [prise, prendre, priseEnCours] = useActionState(prendreLeDossier, ETAT_INITIAL)
  const [refus, refuser, refusEnCours] = useActionState(refuserLeDossier, ETAT_INITIAL)

  return (
    <div className="flex flex-col gap-4">
      {prise.statut === 'erreur' || refus.statut === 'erreur' ? (
        <p role="alert" className="message-erreur">
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
            className="btn btn-principal btn-grand"
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
            className="btn btn-danger btn-grand"
          >
            {texte.refuser}
          </button>
          <p className="text-muted max-w-[280px] text-[12px] font-medium">{texte.refuserAide}</p>
        </form>
      </div>
    </div>
  )
}
