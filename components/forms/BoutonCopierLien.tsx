'use client'

import { useState } from 'react'

import { candidature } from '@/lib/content/candidature'

/** Copier le lien de candidature, avec un retour lu par les lecteurs d'ecran. */
export function BoutonCopierLien({ lien }: { lien: string }) {
  const [copie, noter] = useState<'ok' | 'erreur' | null>(null)
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
        {candidature.agence.copier}
      </button>
      <p role="status" className="text-[13px] font-semibold">
        {copie === 'ok'
          ? candidature.agence.copie
          : copie === 'erreur'
            ? candidature.agence.copieImpossible
            : ''}
      </p>
    </div>
  )
}
