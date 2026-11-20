'use client'

import { useActionState } from 'react'

import { depot as depotFr } from '@/lib/content/garant'
import { retirerUnePiece, type EtatRetrait } from '@/lib/garant/action-depot'
import { depot as depotEn } from '@/lib/content/en/garant'
import { choisir } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'

const ETAT_INITIAL: EtatRetrait = { statut: 'inactif' }

/** Retirer une piece deposee. Un bouton, pas de confirmation : la piece se redepose en un geste. */
export function BoutonRetrait({ pieceId, dossierId }: { pieceId: string; dossierId: string }) {
  const langue = useLangue()
  const depot = choisir(langue, depotFr, depotEn)

  const [etat, envoyer, enCours] = useActionState(retirerUnePiece, ETAT_INITIAL)

  return (
    <form action={envoyer} className="flex items-center gap-3">
      <input type="hidden" name="dossier" value={dossierId ?? ''} />
      <input type="hidden" name="piece" value={pieceId} />
      <button
        type="submit"
        disabled={enCours}
        className="text-flame-texte cursor-pointer text-[13px] font-bold underline-offset-2 hover:underline disabled:cursor-wait"
      >
        {enCours ? depot.retraitEnCours : depot.retirer}
      </button>
      {etat.statut === 'erreur' ? (
        <span className="text-flame-texte text-[12px] font-semibold">{etat.message}</span>
      ) : null}
    </form>
  )
}
