'use client'
import { useActionState } from 'react'
import { verifierSecondFacteur, type EtatSecurite } from '@/lib/agences/action-securite'
import { securite } from '@/lib/content/securite'

export function FormulaireSecurite({ initial }: { initial: EtatSecurite }) {
  const [etat, action, pending] = useActionState(verifierSecondFacteur, initial)
  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      {etat.qr ? (
        <>
          {/* Le SVG est produit par Supabase et charge comme image, jamais comme HTML. */}
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
      ) : null}
      {etat.facteur ? (
        <>
          <input type="hidden" name="facteur" value={etat.facteur} />
          <label htmlFor="code">{securite.code}</label>
          <input
            id="code"
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
            className="bg-ink text-paper rounded-lg p-3 font-bold"
          >
            {securite.verifier}
          </button>
        </>
      ) : (
        <button
          disabled={pending}
          name="operation"
          value="configurer"
          className="bg-ink text-paper rounded-lg p-3 font-bold"
        >
          {securite.activer}
        </button>
      )}
      {etat.erreur ? <p role="alert">{etat.erreur}</p> : null}
    </form>
  )
}
