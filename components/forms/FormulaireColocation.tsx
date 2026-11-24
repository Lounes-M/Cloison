'use client'

import Link from 'next/link'
import { useActionState, useId, useState } from 'react'

import { ChoixLangueDestinataire } from '@/components/langue/ChoixLangueDestinataire'
import { useLangue } from '@/components/langue/LangueContexte'
import { ouvrirUneColocation, type EtatColocation } from '@/lib/agences/action-colocation'
import { colocation as texteFr } from '@/lib/content/colocation'
import { colocation as texteEn } from '@/lib/content/en/colocation'
import { choisir } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatColocation = { statut: 'inactif' }

const CHAMP =
  'border-ink bg-paper w-full rounded-xl border-2 px-4 py-3 text-[15px] font-medium placeholder:text-muted placeholder:font-normal disabled:opacity-50'

/**
 * L'agence ouvre une colocation (plusieurs adresses, le loyer total,
 * l'etendue de l'engagement et la facon de juger la solvabilite), ou ajoute un
 * colocataire a une colocation existante : seules les adresses sont alors
 * demandees. Dans les deux cas, le garant de la premiere adresse peut couvrir
 * plusieurs colocataires (0094).
 */
export function FormulaireColocation({
  verifiee,
  logementId,
  colocationId,
  loyerParDefaut = '',
}: {
  verifiee: boolean
  logementId?: string
  colocationId?: string
  loyerParDefaut?: string
}) {
  const langue = useLangue()
  const t = choisir(langue, texteFr, texteEn)
  const f = t.formulaire
  const ajout = Boolean(colocationId)

  const [etat, envoyer, enCours] = useActionState(ouvrirUneColocation, ETAT_INITIAL)
  const idCourriels = useId()
  const idLoyer = useId()
  const idAide = useId()
  const idCommun = useId()
  const idAideCommun = useId()
  const [etendue, setEtendue] = useState<'part' | 'loyer_entier'>('part')

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-4">
      {logementId ? <input type="hidden" name="logement" value={logementId} /> : null}
      {colocationId ? <input type="hidden" name="colocation" value={colocationId} /> : null}
      {etat.statut === 'ouverte' ? (
        <p role="status" className="message-succes">
          {f.succes(etat.ouverts)}{' '}
          {ajout ? null : (
            <Link
              href={`/espace/colocations/${etat.colocation}`}
              className="font-bold underline underline-offset-2"
            >
              {f.voir}
            </Link>
          )}
        </p>
      ) : null}
      {etat.statut === 'ouverte' && etat.echecs.length > 0 ? (
        <p role="alert" className="message-erreur">
          {f.echecs(etat.echecs.join(', '))}
        </p>
      ) : null}
      {etat.statut === 'erreur' ? (
        <p role="alert" className="message-erreur">
          {etat.message}
        </p>
      ) : null}

      <div>
        <label htmlFor={idCourriels} className="mb-2 block text-[14px] font-bold">
          {ajout ? f.courrielsAjout : f.courriels}
        </label>
        <textarea
          id={idCourriels}
          name="courriels"
          rows={ajout ? 2 : 4}
          autoComplete="off"
          required
          disabled={!verifiee}
          aria-describedby={idAide}
          defaultValue={etat.statut === 'erreur' ? (etat.courriels ?? '') : ''}
          placeholder={'colocataire1@exemple.fr\ncolocataire2@exemple.fr'}
          className={CHAMP}
        />
        <p id={idAide} className="text-muted mt-2 text-[13px] font-medium">
          {ajout ? f.courrielsAjoutAide : f.courrielsAide}
        </p>
      </div>

      <div>
        <label htmlFor={idCommun} className="mb-2 block text-[14px] font-bold">
          {f.garantCommun}
        </label>
        <select
          id={idCommun}
          name="garantCommun"
          defaultValue="1"
          disabled={!verifiee}
          aria-describedby={idAideCommun}
          className={CHAMP}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <option key={n} value={n}>
              {f.garantCommunChoix(n)}
            </option>
          ))}
        </select>
        <p id={idAideCommun} className="text-muted mt-2 text-[13px] font-medium">
          {f.garantCommunAide}
        </p>
      </div>

      <ChoixLangueDestinataire
        name="langueLocataire"
        destinataire="locataire"
        disabled={!verifiee}
      />

      {ajout ? null : (
        <>
          <div>
            <label htmlFor={idLoyer} className="mb-2 block text-[14px] font-bold">
              {f.loyer}
            </label>
            <input
              id={idLoyer}
              name="loyerTotal"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              required
              disabled={!verifiee}
              defaultValue={etat.statut === 'erreur' ? (etat.loyer ?? '') : loyerParDefaut}
              placeholder="1200"
              className={cn(CHAMP, 'max-w-[220px]')}
            />
            <p className="text-muted mt-2 text-[13px] font-medium">{f.loyerAide}</p>
          </div>

          <fieldset disabled={!verifiee} className="flex flex-col gap-2">
            <legend className="mb-2 text-[14px] font-bold">{f.etendue}</legend>
            {(['part', 'loyer_entier'] as const).map((valeur) => (
              <label key={valeur} className="flex items-start gap-3 text-[14px] font-medium">
                <input
                  type="radio"
                  name="etendue"
                  value={valeur}
                  checked={valeur === etendue}
                  onChange={() => setEtendue(valeur)}
                  className="mt-1"
                />
                <span>{t.etendues[valeur]}</span>
              </label>
            ))}
          </fieldset>

          <fieldset
            disabled={!verifiee || etendue !== 'loyer_entier'}
            className="flex flex-col gap-2"
          >
            <legend className="mb-2 text-[14px] font-bold">{f.solvabilite}</legend>
            {(['individuelle', 'commune'] as const).map((valeur) => (
              <label key={valeur} className="flex items-start gap-3 text-[14px] font-medium">
                <input
                  type="radio"
                  name="solvabilite"
                  value={valeur}
                  defaultChecked={valeur === 'individuelle'}
                  className="mt-1"
                />
                <span>{t.solvabilites[valeur]}</span>
              </label>
            ))}
            <p className="text-muted text-[13px] font-medium">{f.solvabiliteAide}</p>
          </fieldset>
        </>
      )}

      <button
        type="submit"
        disabled={enCours || !verifiee}
        className="btn btn-principal btn-grand self-start"
      >
        {enCours ? f.envoi : ajout ? f.boutonAjout : f.bouton}
      </button>
    </form>
  )
}
