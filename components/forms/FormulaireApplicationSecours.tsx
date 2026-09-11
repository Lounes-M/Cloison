'use client'
import { useActionState } from 'react'
import { gererApplicationSecours } from '@/lib/agences/action-application-secours'
import { applicationSecours as t } from '@/lib/content/application-secours'
import { securite } from '@/lib/content/securite'

export function FormulaireApplicationSecours({ facteur }: { facteur?: string }) {
  const [etat, action, pending] = useActionState(gererApplicationSecours, { facteur })
  return (
    <form action={action} className="flex flex-col gap-4">
      {etat.succes ? (
        <p role="status">{t.succes}</p>
      ) : etat.facteur ? (
        <>
          <input type="hidden" name="facteur" value={etat.facteur} />
          {etat.qr ? (
            <>
              {/* Le secret reste temporaire dans le formulaire, sans stockage persistant. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                width={240}
                height={240}
                src={
                  etat.qr.startsWith('data:')
                    ? etat.qr
                    : `data:image/svg+xml,${encodeURIComponent(etat.qr)}`
                }
                alt={securite.aide}
              />
              <code className="break-all">{etat.secret}</code>
            </>
          ) : (
            <p>{t.attente}</p>
          )}
          <label htmlFor="code-secours">{securite.code}</label>
          <input
            id="code-secours"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            className="outlined bg-paper rounded-lg p-3"
          />
          <button
            disabled={pending}
            name="operation"
            value="verifier"
            className="press outlined bg-cobalt text-paper shadow-brut-xs rounded-lg p-3 font-bold disabled:opacity-50"
          >
            {securite.verifier}
          </button>
          <button
            disabled={pending}
            name="operation"
            value="annuler"
            formNoValidate
            className="lien-espace"
          >
            {t.recommencer}
          </button>
        </>
      ) : (
        <button
          disabled={pending}
          name="operation"
          value="preparer"
          className="press outlined bg-cobalt text-paper shadow-brut-xs rounded-lg p-3 font-bold disabled:opacity-50"
        >
          {t.ajouter}
        </button>
      )}
      {etat.erreur ? <p role="alert">{etat.erreur}</p> : null}
    </form>
  )
}
