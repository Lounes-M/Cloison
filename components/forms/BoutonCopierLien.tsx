'use client'

import { useState } from 'react'

import { candidature as candidatureFr } from '@/lib/content/candidature'
import { candidature as candidatureEn } from '@/lib/content/en/candidature'
import { choisir } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'

/** Copier le lien de candidature, ou le message qui le porte, avec un retour lu par les lecteurs d'ecran. */
export function BoutonCopierLien({
  lien,
  sorte = 'lien',
}: {
  lien: string
  sorte?: 'lien' | 'message'
}) {
  const t = choisir(useLangue(), candidatureFr, candidatureEn).agence
  const [bouton, copie, echec] =
    sorte === 'lien'
      ? [t.copier, t.copie, t.copieImpossible]
      : [t.copierMessage, t.messageCopie, t.messageCopieImpossible]
  const [etat, noter] = useState<'ok' | 'erreur' | null>(null)
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="btn btn-secondaire"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(lien)
            noter('ok')
          } catch {
            noter('erreur')
          }
        }}
      >
        {bouton}
      </button>
      <p role="status" className="text-[13px] font-semibold">
        {etat === 'ok' ? copie : etat === 'erreur' ? echec : ''}
      </p>
    </div>
  )
}
