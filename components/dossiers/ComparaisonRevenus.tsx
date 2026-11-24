'use client'
import { useEffect, useRef, useState } from 'react'

import { comparaison as comparaisonFr } from '@/lib/content/comparaison'
import { comparaison as comparaisonEn } from '@/lib/content/en/comparaison'
import { comparaisonRevenus, type ComparaisonRevenus as Resultat } from '@/lib/ocr/comparaison'
import { choisir as choisirTexte, deuxPoints, locale } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'
import { cn } from '@/lib/utils'

/** Un autre dossier ne reutilise ni consentement, ni requete, ni resultat. */
export function ComparaisonRevenus({ dossierId }: { dossierId: string }) {
  return <Comparaison key={dossierId} dossierId={dossierId} />
}

/** Corps borne aussi dans le navigateur, puis relu par le meme schema que le serveur. */
async function lireResultat(reponse: Response): Promise<Resultat> {
  if (!reponse.ok || reponse.redirected) throw new Error('Comparaison indisponible')
  const texte = await reponse.text()
  if (texte.length > 4096) throw new Error('Comparaison indisponible')
  return comparaisonRevenus.parse(JSON.parse(texte))
}

/**
 * L'agence demande la comparaison ; elle lit un ecart, pas un verdict.
 *
 * Le resultat ne vit que dans ce panneau : il s'efface a la fermeture, au
 * masquage de l'onglet et au depart de la page, et n'est ecrit nulle part.
 */
function Comparaison({ dossierId }: { dossierId: string }) {
  const langue = useLangue()
  const texte = choisirTexte(langue, comparaisonFr, comparaisonEn)
  const [accord, consentir] = useState(false)
  const [attente, patienter] = useState(false)
  const [erreur, echouer] = useState(false)
  const [resultat, afficher] = useState<Resultat | null>(null)
  const requete = useRef<AbortController | null>(null)

  function effacer() {
    requete.current?.abort()
    requete.current = null
    patienter(false)
    afficher(null)
    consentir(false)
    echouer(false)
  }
  useEffect(() => {
    const masquer = () => {
      if (document.hidden) effacer()
    }
    document.addEventListener('visibilitychange', masquer)
    window.addEventListener('pagehide', effacer)
    return () => {
      effacer()
      document.removeEventListener('visibilitychange', masquer)
      window.removeEventListener('pagehide', effacer)
    }
  }, [])

  async function comparer() {
    if (!accord || requete.current) return
    const controleur = new AbortController()
    requete.current = controleur
    patienter(true)
    echouer(false)
    afficher(null)
    try {
      const reponse = await fetch(`/espace/dossiers/${dossierId}/comparaison`, {
        method: 'POST',
        headers: { 'X-Cloison-Comparaison': 'revenus-explicite' },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.any([controleur.signal, AbortSignal.timeout(65000)]),
      })
      const donnees = await lireResultat(reponse)
      if (requete.current === controleur && !controleur.signal.aborted && !document.hidden)
        afficher(donnees)
    } catch {
      if (requete.current === controleur && !controleur.signal.aborted) echouer(true)
    } finally {
      // Une reponse tardive ne doit ni liberer ni modifier une nouvelle demande.
      if (requete.current === controleur) {
        requete.current = null
        patienter(false)
      }
    }
  }

  const euros = (cents: number) =>
    (cents / 100).toLocaleString(locale(langue), {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: cents % 100 ? 2 : 0,
      maximumFractionDigits: 2,
    })
  const mois = (periode: string) =>
    new Date(`${periode}-01T12:00:00Z`).toLocaleDateString(locale(langue), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
  const r = resultat
  const lecture = r?.lecture
  const ecart = Math.abs(r?.ecartCents ?? 0)

  return (
    <details
      className="outlined bg-cream mt-5 w-full rounded-xl p-4"
      onToggle={(e) => {
        if (!e.currentTarget.open) effacer()
      }}
    >
      <summary className="cursor-pointer font-bold">{texte.titre}</summary>
      <p className="mt-3 text-sm">{texte.aide}</p>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={accord}
          disabled={attente}
          onChange={(e) => consentir(e.target.checked)}
        />
        {texte.accord}
      </label>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!accord || attente}
          onClick={comparer}
          className="btn btn-principal"
        >
          {attente ? texte.attente : texte.lancer}
        </button>
      </div>
      <div role="status" aria-live="polite" className="mt-3 text-sm break-words">
        {erreur ? <p>{texte.erreur}</p> : null}
        {r && lecture ? (
          <>
            <p
              className={cn(
                'outlined inline-block rounded-lg px-3 py-1 font-bold',
                r.etat === 'concordant'
                  ? 'bg-mint'
                  : r.etat === 'superieur'
                    ? 'bg-sun'
                    : 'bg-paper',
              )}
            >
              {texte.etats[r.etat]}
            </p>
            <p className="mt-2">
              {r.etat === 'concordant'
                ? texte.phrases.concordant
                : r.etat === 'illisible'
                  ? texte.phrases.illisible
                  : texte.phrases[r.etat](euros(ecart), r.ecartPourCent ?? 0)}
            </p>
            <dl className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
              <dt className="font-bold">{texte.declare}</dt>
              <dd>{euros(r.declareCents)}</dd>
              {lecture.revenuCents !== null ? (
                <>
                  <dt className="font-bold">{texte.lu}</dt>
                  <dd>{euros(lecture.revenuCents)}</dd>
                </>
              ) : null}
            </dl>
            <ul className="mt-3 flex flex-col gap-1">
              {lecture.salaire ? (
                <li>
                  {texte.salaire(
                    euros(lecture.salaire.moyenneCents),
                    lecture.salaire.periodes.map(mois).join(', '),
                  )}
                </li>
              ) : null}
              {lecture.salaire && lecture.salaire.periodes.length < 3 ? (
                <li>{texte.partiel(lecture.salaire.periodes.length)}</li>
              ) : null}
              {lecture.salaire?.variable ? <li>{texte.variable}</li> : null}
              {lecture.pension ? (
                <li>
                  {texte.pension(
                    euros(lecture.pension.montantCents),
                    mois(lecture.pension.periode),
                  )}
                </li>
              ) : null}
              {lecture.contradictoires.length ? (
                <li>{texte.contradictoires(lecture.contradictoires.map(mois).join(', '))}</li>
              ) : null}
              {r.illisibles > 0 ? <li>{texte.illisibles(r.illisibles, r.pieces)}</li> : null}
            </ul>
            <p className="mt-3 text-xs">
              {texte.modele}
              {deuxPoints(langue)}
              {r.modele}
            </p>
            <p className="mt-1 text-xs">{texte.temporaire}</p>
            <button type="button" className="mt-2 underline" onClick={effacer}>
              {texte.effacer}
            </button>
          </>
        ) : null}
      </div>
    </details>
  )
}
