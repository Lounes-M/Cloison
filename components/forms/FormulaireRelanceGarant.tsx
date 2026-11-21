'use client'

import { useActionState } from 'react'

import { relancerLeGarant, type EtatRelance } from '@/lib/agences/action-relance'
import { relanceGarant as texteFr } from '@/lib/content/espace'
import { relanceGarant as texteEn } from '@/lib/content/en/espace'
import { choisir } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'

const ETAT_INITIAL: EtatRelance = { statut: 'inactif' }

/** Ouvrir un nouveau cycle de relances quand les trois premieres sont restees sans reponse. */
export function FormulaireRelanceGarant({ dossierId }: { dossierId: string }) {
  const langue = useLangue()
  const texte = choisir(langue, texteFr, texteEn)

  const [etat, envoyer, enCours] = useActionState(relancerLeGarant, ETAT_INITIAL)

  if (etat.statut === 'relance') {
    return (
      <p role="status" className="message-succes">
        {texte.succes}
      </p>
    )
  }

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <input type="hidden" name="dossier" value={dossierId} />
      <p className="text-muted text-[14px] leading-relaxed font-medium">{texte.aide}</p>
      {etat.statut === 'erreur' ? (
        <p role="alert" className="message-erreur">
          {etat.message}
        </p>
      ) : null}
      <div>
        <button type="submit" disabled={enCours} className="btn btn-secondaire">
          {enCours ? texte.envoi : texte.bouton}
        </button>
      </div>
    </form>
  )
}
