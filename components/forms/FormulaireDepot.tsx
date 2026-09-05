'use client'

import { useActionState, useId, useRef, useState } from 'react'

import { depot } from '@/lib/content/garant'
import { deposerUnePiece, type EtatDepot } from '@/lib/garant/action-depot'
import { TAILLE_MAX_DEPOT } from '@/lib/garant/validation'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatDepot = { statut: 'inactif' }

/** Au-dela, une photo est reduite dans le navigateur avant de partir. */
const SEUIL_REDUCTION = 1.2 * 1024 * 1024
const COTE_MAX = 2000

/**
 * Reduit une photo dans le navigateur, sans rien envoyer.
 *
 * Une photo de telephone pese quatre a huit megaoctets, pour un document qui
 * se lit parfaitement a deux mille pixels de cote. La reduire ici fait passer
 * sous la borne pratique sans que la personne ait a s'en occuper, et sans
 * traitement par notre serveur, qui chiffre avant stockage.
 *
 * Rend le fichier tel quel si ce n'est pas une image, s'il est deja leger, ou
 * si le navigateur ne sait pas le decoder : le serveur nommera alors le
 * format, HEIC compris.
 */
async function reduireSiPhoto(fichier: File): Promise<File> {
  if (!fichier.type.startsWith('image/') || fichier.size <= SEUIL_REDUCTION) return fichier

  try {
    const image = await createImageBitmap(fichier)
    const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height))
    if (echelle === 1 && fichier.size <= TAILLE_MAX_DEPOT) {
      image.close()
      return fichier
    }

    const toile = document.createElement('canvas')
    toile.width = Math.round(image.width * echelle)
    toile.height = Math.round(image.height * echelle)
    toile.getContext('2d')?.drawImage(image, 0, 0, toile.width, toile.height)
    image.close()

    const blob = await new Promise<Blob | null>((resoudre) =>
      toile.toBlob(resoudre, 'image/jpeg', 0.85),
    )
    if (!blob) return fichier

    return new File([blob], fichier.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return fichier
  }
}

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
        className="sr-only"
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
        <p className="bg-flame outlined text-ink rounded-xl px-3 py-2 text-[13px] font-semibold">
          {erreur}
        </p>
      ) : null}
    </form>
  )
}
