'use client'
import { useActionState } from 'react'
import { ConfigurationAuthentification } from '@/components/forms/ConfigurationAuthentification'
import { verifierSecondFacteur, type EtatSecurite } from '@/lib/agences/action-securite'
import { securite } from '@/lib/content/securite'

export function FormulaireSecurite({
  initial,
  facteurs = [],
}: {
  initial: EtatSecurite
  facteurs?: Array<{ id: string; nom: string }>
}) {
  const [etat, action, pending] = useActionState(verifierSecondFacteur, initial)
  return (
    <form action={action} className="flex flex-col gap-5">
      {etat.qr ? <ConfigurationAuthentification qr={etat.qr} secret={etat.secret} /> : null}
      {etat.facteur ? (
        <>
          {facteurs.length > 1 ? (
            <>
              <label htmlFor="facteur" className="text-sm font-bold">
                {securite.choisirFacteur}
              </label>
              <select
                id="facteur"
                aria-describedby="facteur-aide"
                name="facteur"
                key={etat.facteur}
                defaultValue={etat.facteur}
                disabled={pending}
                className="outlined bg-paper rounded-lg p-3"
              >
                {facteurs.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nom}
                  </option>
                ))}
              </select>
              <p id="facteur-aide" className="text-muted text-sm leading-relaxed">
                {securite.aideFacteur}
              </p>
            </>
          ) : (
            <input type="hidden" name="facteur" value={etat.facteur} />
          )}
          <label htmlFor="code" className="text-sm font-bold">
            {securite.code}
          </label>
          <input
            id="code"
            name="code"
            aria-describedby="code-aide"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            className="champ-code"
          />
          <p id="code-aide" className="text-muted text-sm leading-relaxed">
            {securite.aideCode}
          </p>
          <button
            disabled={pending}
            name="operation"
            value="verifier"
            className="press outlined bg-cobalt text-paper shadow-brut-xs cursor-pointer rounded-lg p-3 font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {securite.verifier}
          </button>
        </>
      ) : (
        <button
          disabled={pending}
          name="operation"
          value="configurer"
          className="press outlined bg-cobalt text-paper shadow-brut-xs cursor-pointer rounded-lg p-3 font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {securite.activer}
        </button>
      )}
      {etat.erreur ? (
        <p role="alert" className="retour-formulaire retour-formulaire-erreur">
          {etat.erreur}
        </p>
      ) : null}
    </form>
  )
}
