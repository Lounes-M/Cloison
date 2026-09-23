'use client'
import { useActionState, useId } from 'react'
import { testerApplication } from '@/lib/agences/action-tester-application'
import { applicationSecours as t } from '@/lib/content/application-secours'
import { securite } from '@/lib/content/securite'

export function FormulaireTestApplication({ facteur }: { facteur: string }) {
  const [etat, action, pending] = useActionState(testerApplication, {})
  const id = useId()
  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="facteur" value={facteur} />
      <label htmlFor={id} className="text-sm font-bold">
        {securite.code}
      </label>
      <input
        id={id}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        className="champ-code"
      />
      <button disabled={pending} className="lien-espace disabled:opacity-50">
        {t.tester}
      </button>
      {etat.erreur ? (
        <p role="alert" className="retour-formulaire retour-formulaire-erreur">
          {etat.erreur}
        </p>
      ) : null}
      {etat.succes ? (
        <p role="status" className="retour-formulaire retour-formulaire-succes">
          {t.testReussi}
        </p>
      ) : null}
    </form>
  )
}
