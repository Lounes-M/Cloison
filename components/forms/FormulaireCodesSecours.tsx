'use client'
import { useActionState, useState } from 'react'
import { gererCodesSecours, verifierCodeSecours } from '@/lib/agences/action-codes-secours'
import { codesSecours as t } from '@/lib/content/codes-secours'

export function FormulaireCodesSecours({ facteur }: { facteur?: string }) {
  const [masques, setMasques] = useState(false)
  return masques ? (
    <p role="status">{t.masques}</p>
  ) : (
    <CreationCodes facteur={facteur} masquer={() => setMasques(true)} />
  )
}
function CreationCodes({ facteur, masquer }: { facteur?: string; masquer: () => void }) {
  const [etat, action, attente] = useActionState(gererCodesSecours, { message: '' })
  function telecharger() {
    if (!etat.codes || attente) return
    const url = URL.createObjectURL(
      new Blob([t.contenu + '\n\n' + etat.codes.join('\n') + '\n'], {
        type: 'text/plain;charset=utf-8',
      }),
    )
    const lien = document.createElement('a')
    lien.href = url
    lien.download = t.fichier
    lien.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <div className="grid gap-4">
      {!etat.codes && (
        <form action={action} className="grid gap-4">
          <input type="hidden" name="operation" value={facteur ? 'regenerer' : 'generer'} />
          {facteur && (
            <>
              <input type="hidden" name="facteur" value={facteur} />
              <label className="flex items-start gap-3">
                <input type="checkbox" name="accord" required disabled={attente} />
                {t.confirmer}
              </label>
            </>
          )}
          <button
            disabled={attente}
            className="press outlined bg-paper rounded-brut px-5 py-3 font-bold disabled:opacity-60"
          >
            {attente ? t.attente : facteur ? t.regenerer : t.generer}
          </button>
        </form>
      )}
      <p role="status">{etat.message}</p>
      {etat.codes && !attente && (
        <div className="grid gap-4">
          <ul aria-label={t.codes} className="grid gap-2 sm:grid-cols-2">
            {etat.codes.map((code) => (
              <li key={code} className="border-ink rounded-lg border p-3 font-mono break-all">
                {code.match(/.{1,4}/g)?.join('-')}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={telecharger}
            className="press outlined bg-paper rounded-brut px-5 py-3 font-bold"
          >
            {t.telecharger}
          </button>
          <button type="button" onClick={masquer} className="lien-espace">
            {t.masquer}
          </button>
        </div>
      )}
    </div>
  )
}
export function ConnexionCodeSecours() {
  const [etat, action, attente] = useActionState(verifierCodeSecours, { message: '' })
  return (
    <details className="panneau-espace mt-6">
      <summary className="cursor-pointer font-bold">{t.connexion}</summary>
      <form action={action} className="mt-4 grid gap-4">
        <label>
          {t.code}
          <input
            name="code"
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            minLength={16}
            maxLength={128}
            required
            disabled={attente}
            className="border-ink bg-paper mt-2 w-full rounded-xl border-2 px-4 py-3"
          />
        </label>
        <p className="text-muted text-sm">{t.remplacement}</p>
        <button
          disabled={attente}
          className="press outlined bg-paper rounded-brut px-5 py-3 font-bold disabled:opacity-60"
        >
          {attente ? t.attente : t.verifier}
        </button>
        <p role="status">{etat.message}</p>
      </form>
    </details>
  )
}
