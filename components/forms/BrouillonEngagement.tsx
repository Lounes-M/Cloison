'use client'
import { useState, type RefObject } from 'react'
import { gererBrouillon, type EtatBrouillon } from '@/lib/brouillons/action'
import { brouillons as t } from '@/lib/content/brouillons'

export function BrouillonEngagement({
  formulaire,
  indisponible,
  attente,
}: {
  formulaire: RefObject<HTMLFormElement | null>
  indisponible: boolean
  attente: (valeur: boolean) => void
}) {
  const [etat, setEtat] = useState<EtatBrouillon>({ revision: null })
  const [pending, setPending] = useState(false)
  async function agir(operation: 'lire' | 'sauver' | 'supprimer') {
    if (!formulaire.current || pending || indisponible) return
    const donnees = new FormData(formulaire.current)
    donnees.set('brouillonOperation', operation)
    donnees.set('brouillonRevision', etat.revision ?? '')
    setPending(true)
    attente(true)
    try {
      const resultat = await gererBrouillon({}, donnees)
      setEtat(resultat.erreur ? { revision: etat.revision, erreur: resultat.erreur } : resultat)
    } catch {
      setEtat({ revision: etat.revision, erreur: t.erreur })
    } finally {
      setPending(false)
      attente(false)
    }
  }
  function reprendre() {
    if (!etat.saisie || !formulaire.current) return
    for (const [nom, valeur] of Object.entries(etat.saisie)) {
      const champ = formulaire.current.elements.namedItem(nom)
      if (champ instanceof HTMLInputElement && champ.type === 'checkbox')
        champ.checked = Boolean(valeur)
      else if (
        champ instanceof HTMLInputElement ||
        champ instanceof HTMLSelectElement ||
        champ instanceof RadioNodeList
      )
        champ.value = String(valeur)
    }
    setEtat({ revision: etat.revision })
  }
  return (
    <fieldset className="outlined bg-sky rounded-xl p-4" disabled={pending || indisponible}>
      <legend className="px-2 font-bold">{t.sauvegarder}</legend>
      <p className="mb-3 text-sm">{t.aide}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => agir('sauver')} className="lien-espace">
          {t.sauvegarder}
        </button>
        <button type="button" onClick={() => agir('lire')} className="lien-espace">
          {t.reprendre}
        </button>
        {etat.revision ? (
          <button type="button" onClick={() => agir('supprimer')} className="lien-espace">
            {t.supprimer}
          </button>
        ) : null}
      </div>
      {etat.saisie ? (
        <div className="mt-3">
          <p>
            {t.disponible} {t.ecrasement}
          </p>
          {etat.expiration ? (
            <p>
              {t.expiration}{' '}
              {new Date(etat.expiration).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.
            </p>
          ) : null}
          <button type="button" onClick={reprendre} className="lien-espace mt-3">
            {t.confirmer}
          </button>
        </div>
      ) : null}
      {etat.erreur ? (
        <p role="alert" className="mt-3">
          {etat.erreur}
        </p>
      ) : null}
      {etat.message ? (
        <p role="status" className="mt-3">
          {etat.message}
        </p>
      ) : null}
    </fieldset>
  )
}
