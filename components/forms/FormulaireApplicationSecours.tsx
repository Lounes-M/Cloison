'use client'
import { useActionState } from 'react'
import { ConfigurationAuthentification } from '@/components/forms/ConfigurationAuthentification'
import { gererApplicationSecours } from '@/lib/agences/action-application-secours'
import { applicationSecours as tFr } from '@/lib/content/application-secours'
import { securite as securiteFr } from '@/lib/content/securite'
import { applicationSecours as tEn } from '@/lib/content/en/application-secours'
import { securite as securiteEn } from '@/lib/content/en/securite'
import { choisir } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'

export function FormulaireApplicationSecours({ facteur }: { facteur?: string }) {
  const langue = useLangue()
  const t = choisir(langue, tFr, tEn)
  const securite = choisir(langue, securiteFr, securiteEn)

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
            className="btn btn-principal"
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
        <button disabled={pending} name="operation" value="preparer" className="btn btn-principal">
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
