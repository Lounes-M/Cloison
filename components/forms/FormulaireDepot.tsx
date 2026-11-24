'use client'

import { useActionState, useId, useRef, useState, useSyncExternalStore } from 'react'

import { depot as depotFr, documentsDeclares as documentsDeclaresFr } from '@/lib/content/garant'
import { deposerUnePiece, type EtatDepot } from '@/lib/garant/action-depot'
import { reduireSiPhoto } from './reduire-photo'
import { estPhoto, reunirPhotos } from './reunir-photos'
import { TAILLE_MAX_DEPOT, tailleLisible } from '@/lib/garant/validation'
import { cn } from '@/lib/utils'
import { depot as depotEn, documentsDeclares as documentsDeclaresEn } from '@/lib/content/en/garant'
import { choisir } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'

const ETAT_INITIAL: EtatDepot = { statut: 'inactif' }
const rien = () => () => {}

export function FormulaireDepot({
  nature,
  libelle,
  dossierId,
}: {
  nature: string
  libelle: string
  dossierId: string
}) {
  const langue = useLangue()
  const depot = choisir(langue, depotFr, depotEn)
  const documentsDeclares = choisir(langue, documentsDeclaresFr, documentsDeclaresEn)

  const [etat, envoyer, enCours] = useActionState(deposerUnePiece, ETAT_INITIAL)
  const idChamp = useId()
  const [preparation, preparer] = useState<false | 'photo' | 'pages'>(false)
  const champ = useRef<HTMLInputElement>(null)
  // Les photos choisies, dans l'ordre des pages. Vide pour un PDF : il se depose seul.
  const [photos, retenir] = useState<File[]>([])
  const ajout = useRef<HTMLInputElement>(null)
  const [selection, selectionner] = useState<string | null>(null)
  const [erreurLocale, signaler] = useState<string | null>(null)
  // Un nouveau choix masque la confirmation du fichier precedent.
  const [masquePour, masquer] = useState<EtatDepot | null>(null)
  // Sans JavaScript, le champ natif reste visible et le formulaire part tel
  // quel. Avec, le bouton « Ajouter » ouvre le choix, et le nombre comme l'envoi
  // n'apparaissent qu'une fois un fichier choisi : une page de cinq pieces ne
  // montre plus cinq champs et cinq boutons d'envoi vides.
  const interactif = useSyncExternalStore(
    rien,
    () => true,
    () => false,
  )
  const choisi = !interactif || selection !== null || preparation

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
  const depose = etat.statut === 'depose' && etat.nature === nature && masquePour !== etat

  const nomme = (fichier: File) =>
    `${depot.selection} ${fichier.name} (${tailleLisible(fichier.size, langue)})`

  function placer(entree: HTMLInputElement, fichier: File) {
    try {
      const transfert = new DataTransfer()
      transfert.items.add(fichier)
      entree.files = transfert.files
      return entree.files.length === 1
    } catch {
      return false
    }
  }

  // Le fichier est remplace dans le champ lui-meme : le formulaire reste natif,
  // et sans JavaScript la photo part telle quelle, ou le serveur la bornera.
  // Une photo part reduite ; plusieurs partent reunies en un seul PDF, dans
  // l'ordre ou elles ont ete choisies.
  async function appliquer(suivantes: File[], depuisLeChamp: boolean) {
    const entree = champ.current
    if (!entree) return
    const seule = suivantes.length === 1 ? suivantes[0] : undefined
    preparer(seule ? 'photo' : 'pages')
    try {
      if (seule) {
        let reduite = seule
        try {
          reduite = await reduireSiPhoto(seule)
        } catch {
          // La photo d'origine sera verifiee telle quelle.
        }
        // Si le navigateur refuse le remplacement, le champ garde l'original.
        if (reduite !== seule || !depuisLeChamp) placer(entree, reduite)
        retenir(suivantes)
        selectionner(entree.files?.[0] ? nomme(entree.files[0]) : null)
        verifier(entree)
        return
      }

      const reunion = await reunirPhotos(suivantes)
      const message = !reunion.ok
        ? {
            illisible: depot.photoIllisible,
            trop_lourd: depot.reunionTropLourde,
            trop_de_pages: depot.tropDePages,
          }[reunion.raison]
        : placer(entree, reunion.fichier)
          ? null
          : depot.reunionImpossible
      if (message) {
        // Un ajout refuse laisse les pages deja reunies en place. Un choix
        // multiple refuse ne laisse rien : le champ contiendrait des photos
        // separees, dont le serveur ne lirait que la premiere.
        if (depuisLeChamp) {
          entree.value = ''
          retenir([])
          selectionner(null)
        }
        signaler(message)
        return
      }
      retenir(suivantes)
      selectionner(
        depot.reunies(suivantes.length, tailleLisible(entree.files?.[0]?.size ?? 0, langue)),
      )
      verifier(entree)
    } finally {
      preparer(false)
    }
  }

  async function auChoix() {
    masquer(etat)
    const entree = champ.current
    if (!entree) return
    const fichiers = [...(entree.files ?? [])]
    entree.setCustomValidity('')
    signaler(null)
    selectionner(null)
    retenir([])
    if (fichiers.length === 0) return
    if (fichiers.length > 1 && !fichiers.every(estPhoto)) {
      entree.value = ''
      signaler(depot.melange)
      return
    }
    if (!estPhoto(fichiers[0]!)) {
      selectionner(nomme(fichiers[0]!))
      verifier(entree)
      return
    }
    await appliquer(fichiers, true)
  }

  async function auAjout() {
    masquer(etat)
    const nouvelles = [...(ajout.current?.files ?? [])]
    if (ajout.current) ajout.current.value = ''
    if (nouvelles.length === 0) return
    signaler(null)
    if (!nouvelles.every(estPhoto)) {
      signaler(depot.melange)
      return
    }
    await appliquer([...photos, ...nouvelles], false)
  }

  return (
    <form
      action={envoyer}
      className="flex flex-col gap-2"
      onReset={() => {
        retenir([])
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
      {choisi && ['bulletin_paie', 'bilan_comptable'].includes(nature) ? (
        <div>
          <label htmlFor={`${idChamp}-nombre`} className="mb-2 block text-sm font-bold">
            {documentsDeclares.nombre}
          </label>
          <select
            id={`${idChamp}-nombre`}
            name="nombre_documents"
            defaultValue="1"
            disabled={enCours || Boolean(preparation)}
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
        aria-describedby={
          selection && !depose
            ? `${idChamp}-aide ${idChamp}-selection ${idChamp}-rappel`
            : `${idChamp}-aide ${idChamp}-selection`
        }
        aria-invalid={erreurLocale ? true : undefined}
        // Lister JPEG ici fait que iOS convertit lui-meme ses HEIC en JPEG au
        // moment du choix. Sans cette liste, le serveur le refuserait en le
        // nommant, ce qui est correct mais coute un aller-retour.
        accept="application/pdf,image/jpeg,image/png"
        // Plusieurs photos d'un coup sont reunies en un PDF. Sans JavaScript,
        // le serveur n'en lirait qu'une : le choix reste alors unique.
        multiple={interactif}
        disabled={enCours || Boolean(preparation)}
        onChange={auChoix}
        className={
          interactif
            ? 'peer sr-only'
            : 'border-ink rounded-xl border-2 p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-4'
        }
      />
      <label
        htmlFor={idChamp}
        className={cn(
          'press outlined bg-paper shadow-brut-xs inline-flex cursor-pointer items-center gap-2',
          'self-start rounded-[10px] px-4 py-2 text-[14px] font-bold',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4',
          enCours && 'cursor-wait opacity-70',
        )}
      >
        {enCours ? (
          depot.envoi
        ) : (
          <>
            {depot.ajouter}
            <span className="sr-only"> : {libelle.toLowerCase()}</span>
          </>
        )}
      </label>
      {/* Les formats sont dits une fois en tete de liste ; ici, seulement aux lecteurs d'ecran. */}
      <p id={`${idChamp}-aide`} className={interactif ? 'sr-only' : 'text-muted text-sm'}>
        {depot.formats}
      </p>
      <p id={`${idChamp}-selection`} role="status" className="text-sm break-words">
        {preparation === 'pages'
          ? depot.reunion
          : preparation
            ? depot.preparation
            : (selection ?? '')}
      </p>
      {interactif && selection && photos.length > 0 ? (
        <>
          {/* Hors formulaire : sans nom, ce champ ne part jamais avec l'envoi. */}
          <input
            ref={ajout}
            id={`${idChamp}-ajout`}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            disabled={enCours || Boolean(preparation)}
            onChange={auAjout}
            className="peer/ajout sr-only"
          />
          <label
            htmlFor={`${idChamp}-ajout`}
            className={cn(
              'press outlined bg-paper shadow-brut-xs inline-flex cursor-pointer items-center gap-2',
              'self-start rounded-[10px] px-4 py-2 text-[14px] font-bold',
              'peer-focus-visible/ajout:outline-2 peer-focus-visible/ajout:outline-offset-4',
              (enCours || preparation) && 'cursor-wait opacity-70',
            )}
          >
            {depot.ajouterPage}
            <span className="sr-only"> : {libelle.toLowerCase()}</span>
          </label>
        </>
      ) : null}
      {photos.length > 1 ? (
        <button
          type="button"
          disabled={enCours || Boolean(preparation)}
          className="lien-espace self-start"
          onClick={() => {
            signaler(null)
            void appliquer(photos.slice(0, -1), false)
          }}
        >
          {depot.retirerDernierePage}
        </button>
      ) : null}
      {selection ? (
        <button
          type="button"
          disabled={enCours || Boolean(preparation)}
          className="lien-espace self-start"
          onClick={() => {
            if (champ.current) {
              champ.current.value = ''
              champ.current.setCustomValidity('')
            }
            retenir([])
            selectionner(null)
            signaler(null)
            champ.current?.focus()
          }}
        >
          {depot.annulerSelection}
        </button>
      ) : null}

      {depose ? (
        <p role="status" className="message-succes">
          {depot.depose}
        </p>
      ) : null}
      {selection && !depose && !preparation ? (
        <p id={`${idChamp}-rappel`} role="status" className="message-info">
          {depot.rappelSelection}
        </p>
      ) : null}
      {choisi ? (
        <button
          type="submit"
          disabled={enCours || Boolean(preparation)}
          className="btn btn-principal"
        >
          {preparation ? depot.preparation : enCours ? depot.envoi : depot.deposer}
        </button>
      ) : null}
      {erreurLocale ? (
        <p role="alert" className="text-sm font-semibold">
          {erreurLocale}
        </p>
      ) : null}
      {erreur ? (
        <p role="alert" className="message-erreur">
          {erreur}
        </p>
      ) : null}
    </form>
  )
}
