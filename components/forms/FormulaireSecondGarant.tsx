'use client'

import { ChoixLangueDestinataire } from '@/components/langue/ChoixLangueDestinataire'
import { useActionState, useId } from 'react'

import { secondGarant as texteFr } from '@/lib/content/locataire'
import {
  designerSecondGarant,
  retirerSecondGarant,
  type EtatSecondGarant,
} from '@/lib/locataire/action-second-garant'
import { cn } from '@/lib/utils'
import { secondGarant as texteEn } from '@/lib/content/en/locataire'
import { choisir } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'

const ETAT_INITIAL: EtatSecondGarant = { statut: 'inactif' }

/**
 * Designer un second garant, ou lui renvoyer son lien.
 *
 * Comme pour le premier, renvoyer c'est reemettre : l'ancien lien cesse de
 * valoir. L'adresse d'un second garant deja invite ne se change pas.
 */
export function FormulaireSecondGarant({
  dossierId,
  secondActuel,
  libre = false,
}: {
  dossierId: string
  secondActuel: string | null
  /** Le second garant n'a rien commence : son adresse se corrige, il se retire. */
  libre?: boolean
}) {
  const langue = useLangue()
  const texte = choisir(langue, texteFr, texteEn)

  const [etat, envoyer, enCours] = useActionState(designerSecondGarant, ETAT_INITIAL)
  const [etatRetrait, retirer, retraitEnCours] = useActionState(retirerSecondGarant, ETAT_INITIAL)
  const idChamp = useId()
  const valeurInitiale = etat.statut === 'erreur' ? (etat.valeur ?? '') : (secondActuel ?? '')

  return (
    <>
      {etatRetrait.statut === 'retire' ? (
        <p role="status" className="message-succes mb-4">
          {texte.retire}
        </p>
      ) : null}
      {etatRetrait.statut === 'erreur' ? (
        <p role="alert" className="message-erreur mb-4">
          {etatRetrait.message}
        </p>
      ) : null}
      <form action={envoyer} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="dossier" value={dossierId} />
        {etat.statut === 'envoye' ? (
          <p role="status" className="message-succes">
            {texte.succes}
          </p>
        ) : null}
        {etat.statut === 'erreur' ? (
          <p role="alert" className="message-erreur">
            {etat.message}
          </p>
        ) : null}
        <div>
          <label htmlFor={idChamp} className="mb-2 block text-[14px] font-bold">
            {texte.champ}
          </label>
          <input
            id={idChamp}
            name="courriel"
            type="email"
            autoComplete="off"
            required
            defaultValue={valeurInitiale}
            readOnly={Boolean(secondActuel) && !libre}
            placeholder="garant@exemple.fr"
            className={cn(
              'border-ink bg-paper w-full rounded-xl border-2 px-4 py-3 text-[15px] font-medium',
              'placeholder:text-muted placeholder:font-normal',
            )}
          />
        </div>
        {secondActuel && !libre ? null : (
          <ChoixLangueDestinataire name="langueGarant" destinataire="garant" />
        )}
        <button type="submit" disabled={enCours} className="btn btn-secondaire">
          {enCours ? texte.envoi : secondActuel ? texte.renvoyer : texte.bouton}
        </button>
      </form>
      {secondActuel && libre ? (
        <form action={retirer} className="mt-4">
          <input type="hidden" name="dossier" value={dossierId} />
          <p className="text-muted mb-3 text-[13px] leading-relaxed font-medium">{texte.libre}</p>
          <button type="submit" disabled={retraitEnCours} className="btn btn-secondaire">
            {retraitEnCours ? texte.retrait : texte.retirer}
          </button>
        </form>
      ) : null}
    </>
  )
}
