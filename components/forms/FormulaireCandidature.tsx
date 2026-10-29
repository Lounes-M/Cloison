'use client'

import { useActionState, useId } from 'react'

import { candidature as texte } from '@/lib/content/candidature'
import { candidaterAuLogement, type EtatCandidature } from '@/lib/locataire/action-candidature'

const ETAT_INITIAL: EtatCandidature = { statut: 'inactif' }

/** Coller le lien de l'annonce pour rejoindre ce logement et son agence (0070). */
export function FormulaireCandidature({ dossierId }: { dossierId: string }) {
  const [etat, envoyer, enCours] = useActionState(candidaterAuLogement, ETAT_INITIAL)
  const idChamp = useId()
  const idAccord = useId()

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl">{texte.espace.titre}</h2>
      {etat.statut === 'transmis' ? (
        <p
          role="status"
          className="bg-mint outlined mt-4 rounded-xl px-4 py-3 text-[14px] font-semibold"
        >
          {texte.espace.succes(etat.agence)}
        </p>
      ) : (
        <form action={envoyer} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="dossier" value={dossierId} />
          <p>{texte.espace.aide}</p>
          <label htmlFor={idChamp}>{texte.espace.champ}</label>
          <input
            id={idChamp}
            name="code"
            required
            maxLength={300}
            autoComplete="off"
            className="outlined bg-paper rounded-lg p-3"
          />
          <div className="flex gap-3">
            <input
              id={idAccord}
              type="checkbox"
              name="accord"
              required
              className="accent-ink mt-1 size-5 shrink-0"
            />
            <label htmlFor={idAccord}>{texte.espace.consentement}</label>
          </div>
          <button disabled={enCours} className="bg-ink text-paper rounded-lg p-3 font-bold">
            {enCours ? texte.espace.envoi : texte.espace.bouton}
          </button>
          {etat.statut === 'erreur' ? <p role="alert">{etat.message}</p> : null}
        </form>
      )}
    </section>
  )
}
