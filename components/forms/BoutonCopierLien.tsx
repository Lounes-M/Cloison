'use client'

import { useState } from 'react'

import { candidature } from '@/lib/content/candidature'

const textes = {
  lien: [candidature.agence.copier, candidature.agence.copie, candidature.agence.copieImpossible],
  message: [
    candidature.agence.copierMessage,
    candidature.agence.messageCopie,
    candidature.agence.messageCopieImpossible,
  ],
} as const

/** Copier le lien de candidature, ou le message qui le porte, avec un retour lu par les lecteurs d'ecran. */
export function BoutonCopierLien({
  lien,
  sorte = 'lien',
}: {
  lien: string
  sorte?: keyof typeof textes
}) {
  const [bouton, copie, echec] = textes[sorte]
  const [etat, noter] = useState<'ok' | 'erreur' | null>(null)
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="press outlined bg-paper rounded-brut cursor-pointer px-5 py-3 text-[14px] font-bold"
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
