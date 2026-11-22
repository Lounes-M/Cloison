'use client'

import { useActionState, useId } from 'react'

import { candidature as texteFr } from '@/lib/content/candidature'
import { candidaterAuLogement, type EtatCandidature } from '@/lib/locataire/action-candidature'
import { candidature as texteEn } from '@/lib/content/en/candidature'
import { choisir } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'

const ETAT_INITIAL: EtatCandidature = { statut: 'inactif' }

/** Coller le lien de l'annonce pour rejoindre ce logement et son agence (0070). */
export function FormulaireCandidature({ dossierId }: { dossierId: string }) {
  const langue = useLangue()
  const texte = choisir(langue, texteFr, texteEn)

  const [etat, envoyer, enCours] = useActionState(candidaterAuLogement, ETAT_INITIAL)
  const idChamp = useId()
  const idAccord = useId()

  return (
    <section className="panneau-espace mt-6">
      <h2 className="text-xl font-bold">{texte.espace.titre}</h2>
      {etat.statut === 'transmis' ? (
        <p role="status" className="message-succes mt-4">
          {texte.espace.succes(etat.agence)}
        </p>
      ) : (
        <form action={envoyer} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="dossier" value={dossierId} />
          <p className="text-muted text-[14px] leading-relaxed font-medium">{texte.espace.aide}</p>
          <label htmlFor={idChamp} className="text-[14px] font-bold">
            {texte.espace.champ}
          </label>
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
              className="accent-cobalt mt-0.5 size-5 shrink-0"
            />
            <label htmlFor={idAccord} className="text-[14px] font-medium">
              {texte.espace.consentement}
            </label>
          </div>
          <button disabled={enCours} className="btn btn-principal self-start">
            {enCours ? texte.espace.envoi : texte.espace.bouton}
          </button>
          {etat.statut === 'erreur' ? (
            <p role="alert" className="message-erreur">
              {etat.message}
            </p>
          ) : null}
        </form>
      )}
    </section>
  )
}
