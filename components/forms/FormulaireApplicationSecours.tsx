'use client'
import { useActionState } from 'react'
import { ConfigurationAuthentification } from '@/components/forms/ConfigurationAuthentification'
import { gererApplicationSecours } from '@/lib/agences/action-application-secours'
import { applicationSecours as t } from '@/lib/content/application-secours'
import { securite } from '@/lib/content/securite'

export function FormulaireApplicationSecours({ facteur }: { facteur?: string }) {
  const [etat, action, pending] = useActionState(gererApplicationSecours, { facteur })
  return (
    <form action={action} className="flex flex-col gap-4">
      {etat.succes ? (
        <p role="status" className="retour-formulaire retour-formulaire-succes">
          {t.succes}
        </p>
      ) : etat.facteur ? (
        <>
          <input type="hidden" name="facteur" value={etat.facteur} />
          {etat.qr ? (
            <ConfigurationAuthentification qr={etat.qr} secret={etat.secret} />
          ) : (
            <p>{t.attente}</p>
          )}
          <label htmlFor="code-secours" className="text-sm font-bold">
            {securite.code}
          </label>
          <input
            id="code-secours"
            name="code"
            aria-describedby="code-secours-aide"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            className="champ-code"
          />
          <p id="code-secours-aide" className="text-muted text-sm leading-relaxed">
            {securite.aideCode}
          </p>
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
      {etat.erreur ? (
        <p role="alert" className="retour-formulaire retour-formulaire-erreur">
          {etat.erreur}
        </p>
      ) : null}
    </form>
  )
}
