'use client'

import { useActionState, useId } from 'react'

import { mention as texte } from '@/lib/content/garant'
import { apposerMaMention, type EtatMention } from '@/lib/garant/action-mention'
import { cn } from '@/lib/utils'

const ETAT_INITIAL: EtatMention = { statut: 'inactif' }

const champBase =
  'w-full rounded-xl border-2 border-ink bg-paper px-4 py-3 text-[15px] font-medium ' +
  'placeholder:text-muted placeholder:font-normal'

export type MentionAffichee = {
  nom: string
  prenom: string
  adresse: string
  mention: string
  apposeeLe: string | null
}

/**
 * La mention, guidee sans etre fournie.
 *
 * L'ecran affiche les quatre elements exiges et une zone vide. Aucun exemple,
 * aucun brouillon, aucun « par exemple » : l'ADR 0005 le pose, et le champ
 * n'a pas de `placeholder` pour la meme raison. Quand quelque chose manque, le
 * serveur le nomme, et c'est tout.
 */
export function FormulaireMention({
  actuel,
  solidaire,
}: {
  actuel: MentionAffichee | null
  solidaire: boolean
}) {
  const [etat, envoyer, enCours] = useActionState(apposerMaMention, ETAT_INITIAL)
  const id = useId()

  if (etat.statut === 'apposee') {
    return (
      <p className="bg-mint outlined rounded-xl px-4 py-3 text-[14px] font-semibold">
        {texte.succes}
      </p>
    )
  }

  const valeurs = etat.statut === 'erreur' ? (etat.valeurs ?? {}) : {}
  const manques = etat.statut === 'erreur' ? (etat.manques ?? []) : []

  return (
    <form action={envoyer} noValidate className="flex flex-col gap-5">
      {etat.statut === 'erreur' ? (
        <div className="bg-flame outlined text-ink rounded-xl px-4 py-3 text-[14px] font-semibold">
          <p>{etat.message}</p>
          {manques.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 font-medium">
              {manques.map((element) => (
                <li key={element}>{texte.manques[element]}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor={`${id}-prenom`} className="mb-2 block text-[14px] font-bold">
            {texte.prenom}
          </label>
          <input
            id={`${id}-prenom`}
            name="prenom"
            type="text"
            autoComplete="given-name"
            required
            defaultValue={valeurs.prenom ?? actuel?.prenom ?? ''}
            className={cn(champBase)}
          />
        </div>
        <div>
          <label htmlFor={`${id}-nom`} className="mb-2 block text-[14px] font-bold">
            {texte.nom}
          </label>
          <input
            id={`${id}-nom`}
            name="nom"
            type="text"
            autoComplete="family-name"
            required
            defaultValue={valeurs.nom ?? actuel?.nom ?? ''}
            className={cn(champBase)}
          />
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-adresse`} className="mb-2 block text-[14px] font-bold">
          {texte.adresse}
        </label>
        <input
          id={`${id}-adresse`}
          name="adresse"
          type="text"
          autoComplete="street-address"
          required
          defaultValue={valeurs.adresse ?? actuel?.adresse ?? ''}
          className={cn(champBase)}
        />
      </div>

      <div className="bg-sky outlined rounded-[14px] p-5">
        <p className="text-[14px] font-bold">{texte.elementsTitre}</p>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-[14px] font-medium">
          <li>{texte.elements.caution}</li>
          <li>{texte.elements.paiement}</li>
          <li>{texte.elements.montant}</li>
          {solidaire ? <li>{texte.elements.solidarite}</li> : null}
        </ol>
        <p className="text-muted mt-3 text-[13px] font-medium">{texte.elementsAide}</p>
      </div>

      <div>
        <label htmlFor={`${id}-mention`} className="mb-2 block text-[14px] font-bold">
          {texte.champ}
        </label>
        <textarea
          id={`${id}-mention`}
          name="mention"
          rows={6}
          required
          defaultValue={valeurs.mention ?? actuel?.mention ?? ''}
          className={cn(champBase, 'resize-y')}
        />
      </div>

      <button
        type="submit"
        disabled={enCours}
        className={cn(
          'press outlined bg-cobalt shadow-brut rounded-brut cursor-pointer self-start px-8 py-4',
          'text-[17px] font-bold text-white disabled:cursor-wait disabled:opacity-70',
        )}
      >
        {enCours ? texte.envoi : actuel?.apposeeLe ? texte.corriger : texte.bouton}
      </button>
    </form>
  )
}
