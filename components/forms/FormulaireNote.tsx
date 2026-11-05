'use client'

import { useActionState, useEffect, useId, useRef } from 'react'

import { ajouterNote, supprimerNote, type EtatNote } from '@/lib/agences/action-notes'
import { notesDossier as texte } from '@/lib/content/notes'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatNote = { statut: 'inactif' }

/** Ajouter une note interne au dossier. */
export function FormulaireNote({ dossierId }: { dossierId: string }) {
  const [etat, envoyer, enCours] = useActionState(ajouterNote, ETAT_INITIAL)
  const formulaire = useRef<HTMLFormElement>(null)
  const idChamp = useId()
  const idAide = useId()

  useEffect(() => {
    if (etat.statut === 'ajoutee') formulaire.current?.reset()
  }, [etat])

  return (
    <form ref={formulaire} action={envoyer} className="flex flex-col gap-3">
      <input type="hidden" name="dossier" value={dossierId} />
      <label htmlFor={idChamp} className="text-[14px] font-bold">
        {texte.champ}
      </label>
      <textarea
        id={idChamp}
        name="texte"
        required
        rows={3}
        maxLength={texte.limite}
        aria-describedby={idAide}
        defaultValue={etat.statut === 'erreur' ? (etat.valeur ?? '') : ''}
        className="border-ink bg-paper w-full rounded-xl border-2 px-4 py-3 text-[15px] font-medium"
      />
      <p id={idAide} className="text-muted text-[13px] font-medium">
        {texte.indication}
      </p>
      {etat.statut === 'erreur' ? (
        <p
          role="alert"
          className="bg-flame outlined text-ink rounded-xl px-4 py-3 text-[14px] font-semibold"
        >
          {etat.message}
        </p>
      ) : null}
      <div>
        <button
          type="submit"
          disabled={enCours}
          className={cn(
            'press outlined bg-paper shadow-brut-xs min-h-11 cursor-pointer rounded-[10px] px-5 py-3',
            'text-[14px] font-bold disabled:cursor-wait disabled:opacity-70',
          )}
        >
          {enCours ? texte.envoi : texte.bouton}
        </button>
      </div>
    </form>
  )
}

/** Supprimer une note : le bouton n'apparait que si la base l'autorise. */
export function BoutonSupprimerNote({
  dossierId,
  noteId,
  date,
}: {
  dossierId: string
  noteId: string
  date: string
}) {
  const [etat, envoyer, enCours] = useActionState(supprimerNote, ETAT_INITIAL)
  return (
    <form action={envoyer} className="inline">
      <input type="hidden" name="dossier" value={dossierId} />
      <input type="hidden" name="note" value={noteId} />
      <button
        type="submit"
        disabled={enCours}
        aria-label={texte.supprimerNote(date)}
        className="lien-espace cursor-pointer text-[13px] font-bold disabled:cursor-wait"
      >
        {enCours ? texte.suppression : texte.supprimer}
      </button>
      {etat.statut === 'erreur' ? (
        <span role="alert" className="ml-2 text-[13px] font-semibold">
          {etat.message}
        </span>
      ) : null}
    </form>
  )
}
