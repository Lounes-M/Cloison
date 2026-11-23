'use client'

import Link from 'next/link'
import { useActionState, useId } from 'react'

import { importerDepuisApimo, reglerApimo, type EtatLogiciel } from '@/lib/logiciels/action'
import { logiciels as texteFr } from '@/lib/content/logiciels'
import { logiciels as texteEn } from '@/lib/content/en/logiciels'
import { choisir } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'

const ETAT_INITIAL: EtatLogiciel = { statut: 'inactif' }

/** Regler l'identifiant Apimo de l'agence, puis lancer l'import (0089). */
export function FormulaireApimo({ identifiant }: { identifiant: string | null }) {
  const texte = choisir(useLangue(), texteFr, texteEn)
  const [reglage, regler, reglageEnCours] = useActionState(reglerApimo, ETAT_INITIAL)
  const [imp, importer, importEnCours] = useActionState(importerDepuisApimo, ETAT_INITIAL)
  const id = useId()

  return (
    <div className="mt-4 grid gap-6">
      <form action={regler} noValidate className="flex flex-col gap-4">
        {reglage.statut === 'enregistre' ? (
          <p role="status" className="message-succes">
            {texte.enregistre}
          </p>
        ) : null}
        {reglage.statut === 'erreur' ? (
          <p role="alert" className="message-erreur">
            {reglage.message}
          </p>
        ) : null}
        <div className="min-w-0">
          <label htmlFor={id} className="mb-2 block text-[14px] font-bold">
            {texte.identifiant}
          </label>
          <input
            id={id}
            name="identifiant"
            type="text"
            inputMode="numeric"
            maxLength={10}
            autoComplete="off"
            defaultValue={identifiant ?? ''}
            aria-describedby={`${id}-aide`}
            className="border-ink bg-paper placeholder:text-muted w-full max-w-[320px] rounded-xl border-2 px-4 py-3 text-[15px] font-medium placeholder:font-normal"
          />
          <p id={`${id}-aide`} className="text-muted mt-2 text-[13px] font-medium">
            {texte.identifiantAide}
          </p>
        </div>
        <button type="submit" disabled={reglageEnCours} className="btn btn-secondaire self-start">
          {reglageEnCours ? texte.enregistrement : texte.enregistrer}
        </button>
      </form>

      {identifiant ? (
        <form action={importer} className="flex flex-col gap-4">
          {imp.statut === 'importe' ? (
            <p role="status" className="message-succes">
              {texte.succes(imp.crees, imp.misAJour)}{' '}
              <Link href="/espace/logements" className="underline underline-offset-2">
                {texte.voir}
              </Link>
            </p>
          ) : null}
          {imp.statut === 'erreur' ? (
            <p role="alert" className="message-erreur">
              {imp.message}
            </p>
          ) : null}
          <button type="submit" disabled={importEnCours} className="btn btn-principal self-start">
            {importEnCours ? texte.importation : texte.importer}
          </button>
        </form>
      ) : null}
    </div>
  )
}
