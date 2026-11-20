'use client'
import { useId, useState } from 'react'
import {
  aideDossier as tFr,
  categoriesSupport,
  type EspaceSupport,
  type CategorieSupport,
} from '@/lib/content/support-dossier'
import { preparerMessageSupport } from '@/lib/support/message'
import { aideDossier as tEn } from '@/lib/content/en/support-dossier'
import { choisir as choisirTexte } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'
export function FormulaireSupportDossier({
  adresse,
  reference,
  espace,
}: {
  adresse: string
  reference: string
  espace: EspaceSupport
}) {
  const langue = useLangue()
  const t = choisirTexte(langue, tFr, tEn)

  const id = useId()
  const [categorie, choisir] = useState<CategorieSupport>('acces')
  const [copie, noter] = useState<'repos' | 'ok' | 'erreur'>('repos')
  const message = preparerMessageSupport({ adresse, reference, espace, categorie, langue })
  if (!message) return null
  // Seul le locataire est tutoye ; l'agence et le garant sont vouvoyes.
  const tutoie = espace === 'locataire'
  return (
    <details className="panneau-espace mt-10 min-w-0">
      <summary className="cursor-pointer text-lg font-bold">{t.titre}</summary>
      <div className="mt-5 grid min-w-0 gap-4">
        <p>{tutoie ? t.aideLocataire : t.aide}</p>
        <p className="text-sm font-semibold">
          {tutoie ? t.confidentialiteLocataire : t.confidentialite}
        </p>
        <p className="min-w-0 break-words">
          {t.destinataire} : {adresse}
        </p>
        <label htmlFor={`${id}-categorie`} className="font-bold">
          {t.categorie}
        </label>
        <select
          id={`${id}-categorie`}
          value={categorie}
          onChange={(e) => {
            choisir(e.target.value as CategorieSupport)
            noter('repos')
          }}
          className="outlined bg-paper w-full min-w-0 rounded-lg px-3 py-2"
        >
          {categoriesSupport[espace].map((c) => (
            <option key={c} value={c}>
              {t.categories[c]}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-texte`} className="font-bold">
          {t.apercu}
        </label>
        <textarea
          id={`${id}-texte`}
          readOnly
          value={message.texte}
          rows={7}
          className="outlined bg-paper w-full min-w-0 rounded-lg p-3 text-sm"
        />
        <div className="flex flex-wrap gap-3">
          <a
            href={message.lien}
            className="press outlined bg-cobalt text-paper shadow-brut-xs rounded-lg px-4 py-2 font-bold"
          >
            {t.ouvrir}
          </a>
          <button
            type="button"
            className="lien-espace"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(message.texte)
                noter('ok')
              } catch {
                noter('erreur')
              }
            }}
          >
            {t.copier}
          </button>
        </div>
        {copie === 'ok' ? (
          <p role="status">{tutoie ? t.copieLocataire : t.copie}</p>
        ) : copie === 'erreur' ? (
          <p role="alert">{t.erreurCopie}</p>
        ) : null}
      </div>
    </details>
  )
}
