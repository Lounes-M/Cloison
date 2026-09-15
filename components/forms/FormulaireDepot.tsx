'use client'

import { useActionState, useId, useRef, useState } from 'react'

import { depot, documentsDeclares } from '@/lib/content/garant'
import { deposerUnePiece, type EtatDepot } from '@/lib/garant/action-depot'
import { reduireSiPhoto } from './reduire-photo'
import { TAILLE_MAX_DEPOT } from '@/lib/garant/validation'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatDepot = { statut: 'inactif' }

export function FormulaireDepot({
  nature,
  libelle,
  dossierId,
}: {
  nature: string
  libelle: string
  dossierId: string
}) {
  const [etat, envoyer, enCours] = useActionState(deposerUnePiece, ETAT_INITIAL)
  const idChamp = useId()
  const [preparation, preparer] = useState(false)
  const champ = useRef<HTMLInputElement>(null)
  const [selection, selectionner] = useState<string | null>(null)
  const [erreurLocale, signaler] = useState<string | null>(null)

  function verifier(entree: HTMLInputElement) {
    const fichier = entree.files?.[0]
    const message =
      !fichier || fichier.size === 0
        ? depot.vide
        : fichier.size > TAILLE_MAX_DEPOT
          ? depot.tropLourd
          : ''
    entree.setCustomValidity(message)
    signaler(message || null)
    return !message
  }

  const erreur = etat.statut === 'erreur' && etat.nature === nature ? etat.message : null

  // Le fichier est remplace dans le champ lui-meme : le formulaire reste natif,
  // et sans JavaScript la photo part telle quelle, ou le serveur la bornera.
  async function auChoix() {
    const entree = champ.current
    const fichier = entree?.files?.[0]
    if (!entree) return
    entree.setCustomValidity('')
    signaler(null)
    selectionner(null)
    if (!fichier) return

    preparer(true)
    try {
      const reduit = await reduireSiPhoto(fichier)
      if (reduit !== fichier) {
        const transfert = new DataTransfer()
        transfert.items.add(reduit)
        entree.files = transfert.files
      }
    } catch {
      // Si le navigateur refuse le remplacement, verifier le fichier original.
    } finally {
      const choisi = entree.files?.[0]
      selectionner(
        choisi
          ? `${choisi.name} (${(choisi.size / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Mo)`
          : null,
      )
      verifier(entree)
      preparer(false)
    }
  }

  return (
    <form
      action={envoyer}
      className="flex flex-col gap-2"
      onReset={() => {
        selectionner(null)
        signaler(null)
        champ.current?.setCustomValidity('')
      }}
      onSubmit={(evenement) => {
        if (preparation || enCours || !champ.current || !verifier(champ.current)) {
          evenement.preventDefault()
          champ.current?.reportValidity()
        }
      }}
    >
      <input type="hidden" name="dossier" value={dossierId ?? ''} />
      <input type="hidden" name="nature" value={nature} />
      {['bulletin_paie', 'bilan_comptable'].includes(nature) ? (
        <div>
          <label htmlFor={`${idChamp}-nombre`} className="mb-2 block text-sm font-bold">
            {documentsDeclares.nombre}
          </label>
          <select
            id={`${idChamp}-nombre`}
            name="nombre_documents"
            defaultValue="1"
            disabled={enCours || preparation}
            aria-describedby={`${idChamp}-nombre-aide`}
            className="border-ink bg-paper rounded-xl border-2 px-3 py-2"
          >
            {[1, 2, ...(nature === 'bulletin_paie' ? [3] : [])].map((nombre) => (
              <option key={nombre} value={nombre}>
                {nombre}
              </option>
            ))}
          </select>
          <p id={`${idChamp}-nombre-aide`} className="text-muted mt-2 text-sm">
            {documentsDeclares.aide}
          </p>
        </div>
      ) : null}

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
        required
        onInvalid={(evenement) => {
          evenement.preventDefault()
          verifier(evenement.currentTarget)
          evenement.currentTarget.focus()
        }}
        aria-describedby={`${idChamp}-aide ${idChamp}-selection`}
        aria-invalid={erreurLocale ? true : undefined}
        // Lister JPEG ici fait que iOS convertit lui-meme ses HEIC en JPEG au
        // moment du choix. Sans cette liste, le serveur le refuserait en le
        // nommant, ce qui est correct mais coute un aller-retour.
        accept="application/pdf,image/jpeg,image/png"
        disabled={enCours || preparation}
        onChange={auChoix}
        className="border-ink rounded-xl border-2 p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-4"
      />
      <p id={`${idChamp}-aide`} className="text-muted text-sm">
        {depot.formats}
      </p>
      <p id={`${idChamp}-selection`} role="status" className="text-sm break-words">
        {preparation ? depot.preparation : selection ? `${depot.selection} ${selection}` : ''}
      </p>
      {selection ? (
        <button
          type="button"
          disabled={enCours || preparation}
          className="lien-espace self-start"
          onClick={() => {
            if (champ.current) {
              champ.current.value = ''
              champ.current.setCustomValidity('')
            }
            selectionner(null)
            signaler(null)
            champ.current?.focus()
          }}
        >
          {depot.annulerSelection}
        </button>
      ) : null}

      <button
        type="submit"
        disabled={enCours || preparation}
        className="press shadow-brut-xs outlined bg-cobalt cursor-pointer rounded-xl px-4 py-3 font-bold text-white disabled:translate-none disabled:cursor-not-allowed disabled:opacity-70"
      >
        {preparation ? depot.preparation : enCours ? depot.envoi : 'Déposer le fichier sélectionné'}
      </button>
      {erreurLocale ? (
        <p role="alert" className="text-sm font-semibold">
          {erreurLocale}
        </p>
      ) : null}
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
