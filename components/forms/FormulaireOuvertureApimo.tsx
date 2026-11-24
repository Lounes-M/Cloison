'use client'

import { useActionState, useId } from 'react'

import { ChoixLangueDestinataire } from '@/components/langue/ChoixLangueDestinataire'
import { useLangue } from '@/components/langue/LangueContexte'
import { ouvrirDepuisApimo, type EtatOuvertureApimo } from '@/lib/connecteurs/apimo/action'
import { apimo as tFr } from '@/lib/content/apimo'
import { apimo as tEn } from '@/lib/content/en/apimo'
import { choisir } from '@/lib/i18n'

const ETAT_INITIAL: EtatOuvertureApimo = { statut: 'inactif' }

export type BienAffiche = { id: string; libelle: string; details: string }

/** Choisir un bien lu chez Apimo, puis ouvrir le dossier du candidat. */
export function FormulaireOuvertureApimo({
  biens,
  verifiee,
}: {
  biens: BienAffiche[]
  verifiee: boolean
}) {
  const t = choisir(useLangue(), tFr, tEn).ouverture
  const [etat, envoyer, enCours] = useActionState(ouvrirDepuisApimo, ETAT_INITIAL)
  const idCourriel = useId()
  const idBail = useId()
  const idLoyer = useId()
  const champ =
    'border-ink bg-paper w-full rounded-xl border-2 px-4 py-3 text-[15px] font-medium disabled:opacity-50'
  const erreur = etat.statut === 'erreur' ? etat : null

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-5">
      {etat.statut === 'ouvert' ? (
        <p role="status" className="message-succes">
          {t.succes(etat.email)}
        </p>
      ) : null}
      {etat.statut === 'ouvert' && etat.incomplet ? (
        <p role="alert" className="message-erreur">
          {t.incomplet}
        </p>
      ) : null}
      {erreur ? (
        <p role="alert" className="message-erreur">
          {erreur.message}
        </p>
      ) : null}

      <fieldset className="min-w-0">
        <legend className="mb-2 text-[14px] font-bold">{t.biens}</legend>
        <ul className="grid max-h-[420px] gap-2 overflow-y-auto pr-1">
          {biens.map((bien) => (
            <li key={bien.id}>
              <label className="outlined flex cursor-pointer items-start gap-3 rounded-xl p-3">
                <input type="radio" name="bien" value={bien.id} required className="mt-1" />
                <span className="min-w-0 break-words">
                  <span className="block font-bold">{bien.libelle}</span>
                  <span className="text-muted block text-sm font-medium">{bien.details}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div>
        <label htmlFor={idCourriel} className="mb-2 block text-[14px] font-bold">
          {t.courriel}
        </label>
        <input
          id={idCourriel}
          name="courriel"
          type="email"
          autoComplete="off"
          required
          disabled={!verifiee}
          defaultValue={erreur?.valeur ?? ''}
          placeholder="locataire@exemple.fr"
          className={champ}
        />
      </div>

      <ChoixLangueDestinataire
        name="langueLocataire"
        destinataire="locataire"
        disabled={!verifiee}
      />

      <div>
        <label htmlFor={idBail} className="mb-2 block text-[14px] font-bold">
          {t.bail}
        </label>
        <input
          id={idBail}
          name="bail"
          type="text"
          autoComplete="off"
          maxLength={40}
          disabled={!verifiee}
          defaultValue={erreur?.bail ?? ''}
          className={`${champ} max-w-[320px]`}
        />
        <p className="text-muted mt-2 text-[13px] font-medium">{t.bailAide}</p>
      </div>

      <div>
        <label htmlFor={idLoyer} className="mb-2 block text-[14px] font-bold">
          {t.loyer}
        </label>
        <input
          id={idLoyer}
          name="loyer"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={!verifiee}
          defaultValue={erreur?.loyer ?? ''}
          placeholder="850"
          className={`${champ} max-w-[220px]`}
        />
        <p className="text-muted mt-2 text-[13px] font-medium">{t.loyerAide}</p>
      </div>

      <button
        type="submit"
        disabled={enCours || !verifiee}
        className="btn btn-principal btn-grand self-start"
      >
        {enCours ? t.envoi : t.bouton}
      </button>
    </form>
  )
}
