'use client'

import { useActionState, useEffect, useId, useRef } from 'react'

import { envoyerLienDeConnexion, type EtatConnexion } from '@/lib/agences/connexion'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatConnexion = { statut: 'inactif' }

const champBase =
  'w-full rounded-xl border-2 border-ink bg-paper px-4 py-3 text-[15px] font-medium ' +
  'placeholder:text-muted placeholder:font-normal'

/**
 * L'entree dans l'espace agence.
 *
 * Un champ, un bouton. Pas de mot de passe, comme le pose l'ADR 0002, donc pas
 * de « mot de passe oublie », pas de second champ, pas de regle de complexite a
 * expliquer.
 *
 * L'ecran de succes ne dit jamais si l'adresse existe. Il ne le dit pas non
 * plus quand le domaine est refuse : la meme phrase dans tous les cas, sans
 * quoi cette page renseignerait sur qui travaille ou.
 */
export function FormulaireConnexion({ lienExpire = false }: { lienExpire?: boolean }) {
  const [etat, envoyer, enCours] = useActionState(envoyerLienDeConnexion, ETAT_INITIAL)
  const idChamp = useId()
  const resume = useRef<HTMLDivElement>(null)

  // Un lecteur d'ecran doit apprendre le resultat sans avoir a le chercher.
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
        <p className="font-display text-2xl uppercase">Regarde tes e-mails.</p>
        <p className="mx-auto mt-3 max-w-[380px] text-[15px] leading-relaxed font-medium">
          Si cette adresse peut ouvrir un espace, un lien vient de partir. Il est valable une heure,
          et une seule fois.
        </p>
      </div>
    )
  }

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-5">
      {lienExpire ? (
        <p className="bg-sun outlined rounded-xl px-4 py-3 text-[14px] font-semibold">
          Ce lien a expiré ou a déjà servi. Demandes-en un nouveau.
        </p>
      ) : null}

      {etat.statut === 'erreur' ? (
        <p className="bg-flame outlined rounded-xl px-4 py-3 text-[14px] font-semibold text-white">
          {etat.message}
        </p>
      ) : null}

      <div>
        <label htmlFor={idChamp} className="mb-2 block text-[14px] font-bold">
          Ton adresse professionnelle
        </label>
        <input
          id={idChamp}
          name="courriel"
          type="email"
          autoComplete="email"
          required
          defaultValue={etat.statut === 'erreur' ? etat.valeur : ''}
          placeholder="prenom@ton-agence.fr"
          aria-describedby={`${idChamp}-aide`}
          className={cn(champBase)}
        />
        <p id={`${idChamp}-aide`} className="text-muted mt-2 text-[13px] font-medium">
          C&apos;est elle qui rattache ton compte à ton agence. Une adresse Gmail ou Outlook
          personnelle ne peut pas ouvrir d&apos;espace.
        </p>
      </div>

      <button
        type="submit"
        disabled={enCours}
        className={cn(
          'press outlined bg-cobalt shadow-brut rounded-brut cursor-pointer px-8 py-4',
          'text-[17px] font-bold text-white disabled:cursor-wait disabled:opacity-70',
        )}
      >
        {enCours ? 'Envoi…' : 'Recevoir mon lien'}
      </button>
    </form>
  )
}
