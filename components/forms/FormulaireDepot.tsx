'use client'

import { useActionState, useId, useRef, useState } from 'react'

import { depot } from '@/lib/content/garant'
import { deposerUnePiece, type EtatDepot } from '@/lib/garant/action-depot'
import { reduireSiPhoto } from './reduire-photo'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatDepot = { statut: 'inactif' }

export function FormulaireDepot({ nature, libelle }: { nature: string; libelle: string }) {
  const [etat, envoyer, enCours] = useActionState(deposerUnePiece, ETAT_INITIAL)
  const idChamp = useId()
  const [preparation, preparer] = useState(false)
  const champ = useRef<HTMLInputElement>(null)

  const erreur = etat.statut === 'erreur' && etat.nature === nature ? etat.message : null

  // Le fichier est remplace dans le champ lui-meme : le formulaire reste natif,
  // et sans JavaScript la photo part telle quelle, ou le serveur la bornera.
  async function auChoix() {
    const entree = champ.current
    const fichier = entree?.files?.[0]
    if (!entree || !fichier) return

    preparer(true)
    try {
      const reduit = await reduireSiPhoto(fichier)
      if (reduit !== fichier) {
        const transfert = new DataTransfer()
        transfert.items.add(reduit)
        entree.files = transfert.files
      }
    } finally {
      preparer(false)
    }
  }

  return (
    <form action={envoyer} className="flex flex-col gap-2">
      <input type="hidden" name="nature" value={nature} />

      <label
        htmlFor={idChamp}
        className={cn(
          'press outlined bg-paper shadow-brut-xs inline-flex cursor-pointer items-center gap-2',
          'self-start rounded-[10px] px-4 py-2 text-[14px] font-bold',
          enCours && 'cursor-wait opacity-70',
        )}
      >
        {enCours ? depot.envoi : `${depot.ajouter} : ${libelle.toLowerCase()}`}
      </label>
      <input
        ref={champ}
        id={idChamp}
        name="fichier"
        type="file"
        // Lister JPEG ici fait que iOS convertit lui-meme ses HEIC en JPEG au
        // moment du choix. Sans cette liste, le serveur le refuserait en le
        // nommant, ce qui est correct mais coute un aller-retour.
        accept="application/pdf,image/jpeg,image/png"
        disabled={enCours || preparation}
        onChange={auChoix}
        className="border-ink rounded-xl border-2 p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-4"
      />

      <button
        type="submit"
        disabled={enCours || preparation}
        className="outlined bg-cobalt rounded-xl px-4 py-3 font-bold text-white disabled:opacity-70"
      >
        {preparation
          ? 'Préparation de la photo…'
          : enCours
            ? depot.envoi
            : 'Déposer le fichier sélectionné'}
      </button>
      {erreur ? (
        <p
          role="alert"
          className="bg-flame outlined text-ink rounded-xl px-3 py-2 text-[13px] font-semibold"
        >
          {erreur}
        </p>
      ) : null}
    </form>
  )
}
