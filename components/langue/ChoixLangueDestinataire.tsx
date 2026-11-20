'use client'

import { useId } from 'react'

import { useLangue } from '@/components/langue/LangueContexte'
import { interfaceEspace as interfaceEn } from '@/lib/content/en/interface'
import { interfaceEspace as interfaceFr } from '@/lib/content/interface'
import { choisir, LANGUES } from '@/lib/i18n'

/**
 * La langue de la personne que l'on invite : un garant pour un locataire, un
 * locataire pour une agence. Elle decide de la langue de son lien, de ses
 * courriels et de son espace a l'arrivee ; elle pourra la changer elle-meme.
 * Par defaut, la langue de celui qui invite.
 */
export function ChoixLangueDestinataire({
  name,
  destinataire,
  disabled = false,
}: {
  name: 'langueGarant' | 'langueLocataire'
  destinataire: 'garant' | 'locataire'
  disabled?: boolean
}) {
  const langue = useLangue()
  const t = choisir(langue, interfaceFr, interfaceEn).invitation
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[14px] font-bold">
        {t[destinataire]}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={langue}
        disabled={disabled}
        aria-describedby={`${id}-aide`}
        className="border-ink bg-paper w-full max-w-[320px] rounded-xl border-2 px-4 py-3 text-[15px] font-medium disabled:opacity-50"
      >
        {LANGUES.map((code) => (
          <option key={code} value={code}>
            {t.langues[code]}
          </option>
        ))}
      </select>
      <p id={`${id}-aide`} className="text-muted mt-2 text-[13px] font-medium">
        {t.aide}
      </p>
    </div>
  )
}
