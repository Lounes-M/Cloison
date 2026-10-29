'use client'

import { useActionState, useEffect, useId, useRef } from 'react'

import { candidature as texteCandidature } from '@/lib/content/candidature'
import { porte } from '@/lib/content/locataire'
import { ouvrirMonDossier, type EtatOuverture } from '@/lib/locataire/action-ouverture'
import { cn } from '@/lib/utils'
import { informationCollecte } from '@/lib/content/information-collecte'

const ETAT_INITIAL: EtatOuverture = { statut: 'inactif' }

/**
 * La porte principale : un champ, un bouton.
 *
 * Aucune restriction de domaine ici, a l'inverse du formulaire agence : un
 * locataire a une adresse personnelle, et c'est normal. Depuis un lien de
 * candidature (0070), le code voyage en champ cache, avec l'accord explicite
 * de transmettre le dossier a l'agence nommee.
 */
export function FormulaireOuverture({
  candidature,
}: { candidature?: { code: string; agence: string } } = {}) {
  const [etat, envoyer, enCours] = useActionState(ouvrirMonDossier, ETAT_INITIAL)
  const idChamp = useId()
  const idAccord = useId()
  const resume = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (etat.statut === 'envoye') resume.current?.focus()
  }, [etat])

  if (etat.statut === 'envoye') {
    return (
      <div
        ref={resume}
        tabIndex={-1}
        className="bg-mint outlined shadow-brut rounded-[18px] p-8 text-center"
      >
        <p className="font-display text-2xl uppercase">{porte.succesTitre}</p>
        <p className="mx-auto mt-3 max-w-[380px] text-[15px] leading-relaxed font-medium">
          {porte.succesTexte}
        </p>
        {etat.candidature ? (
          <p className="mx-auto mt-3 max-w-[380px] text-[15px] leading-relaxed font-semibold">
            {etat.candidature === 'rattachee'
              ? texteCandidature.page.rattache
              : texteCandidature.page.nonRattache}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-5">
      {etat.statut === 'erreur' ? (
        <p
          role="alert"
          className="bg-flame outlined text-ink rounded-xl px-4 py-3 text-[14px] font-semibold"
        >
          {etat.message}
        </p>
      ) : null}

      <div>
        <label htmlFor={idChamp} className="mb-2 block text-[14px] font-bold">
          {porte.champ}
        </label>
        <input
          id={idChamp}
          name="courriel"
          type="email"
          autoComplete="email"
          required
          defaultValue={etat.statut === 'erreur' ? etat.valeur : ''}
          placeholder="toi@exemple.fr"
          aria-describedby={`${idChamp}-aide`}
          className={cn(
            'border-ink bg-paper w-full rounded-xl border-2 px-4 py-3 text-[15px] font-medium',
            'placeholder:text-muted placeholder:font-normal',
          )}
        />
        <p id={`${idChamp}-aide`} className="text-muted mt-2 text-[13px] font-medium">
          {porte.aide}
        </p>
        <p className="text-muted mt-2 text-[13px] font-medium">
          {informationCollecte.locataire}{' '}
          <a href="/confidentialite" className="underline underline-offset-4">
            {informationCollecte.lien}
          </a>
        </p>
      </div>

      {candidature ? (
        <div className="flex gap-3">
          <input type="hidden" name="candidature" value={candidature.code} />
          <input
            id={idAccord}
            type="checkbox"
            name="accord"
            required
            className="accent-ink mt-1 size-5 shrink-0"
          />
          <label htmlFor={idAccord} className="text-[14px] font-medium">
            {texteCandidature.page.accord(candidature.agence)}
          </label>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={enCours}
        className={cn(
          'press outlined bg-flame shadow-brut rounded-brut cursor-pointer px-8 py-4',
          'text-ink text-[17px] font-bold disabled:cursor-wait disabled:opacity-70',
        )}
      >
        {enCours ? porte.envoi : porte.bouton}
      </button>
    </form>
  )
}
