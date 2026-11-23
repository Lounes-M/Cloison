'use client'
import { useEffect, useRef, useState } from 'react'

import { authenticite as authenticiteFr } from '@/lib/content/authenticite'
import { authenticite as authenticiteEn } from '@/lib/content/en/authenticite'
import { verification2dDoc, type Verification2dDoc } from '@/lib/2ddoc/resultat'
import { choisir as choisirTexte, locale } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'

/** Une autre piece ne reutilise ni requete, ni resultat. */
export function VerificationAvis({ pieceId }: { pieceId: string }) {
  return <Verification key={pieceId} pieceId={pieceId} />
}

/** Corps borne aussi dans le navigateur, puis relu par le meme schema que le serveur. */
async function lireResultat(reponse: Response): Promise<Verification2dDoc> {
  if (!reponse.ok || reponse.redirected) throw new Error('Verification indisponible')
  const texte = await reponse.text()
  if (texte.length > 4096) throw new Error('Verification indisponible')
  return verification2dDoc.parse(JSON.parse(texte))
}

function Verification({ pieceId }: { pieceId: string }) {
  const langue = useLangue()
  const texte = choisirTexte(langue, authenticiteFr, authenticiteEn)
  const [attente, patienter] = useState(false)
  const [erreur, echouer] = useState(false)
  const [resultat, afficher] = useState<Verification2dDoc | null>(null)
  const requete = useRef<AbortController | null>(null)

  function effacer() {
    requete.current?.abort()
    requete.current = null
    patienter(false)
    afficher(null)
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

  async function verifier() {
    if (requete.current) return
    const controleur = new AbortController()
    requete.current = controleur
    patienter(true)
    echouer(false)
    afficher(null)
    try {
      const reponse = await fetch(`/espace/pieces/${pieceId}/authenticite`, {
        method: 'POST',
        headers: { 'X-Cloison-2ddoc': 'verification-explicite' },
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

  const valeurs = resultat?.etat === 'authentique' ? resultat.valeurs : null
  const lignes: [string, string][] = valeurs
    ? (
        [
          [texte.annee, valeurs.annee],
          [texte.declarants, valeurs.declarants?.join(', ')],
          [
            texte.revenuFiscalDeReference,
            valeurs.revenuFiscalDeReference &&
              `${Number(valeurs.revenuFiscalDeReference).toLocaleString(locale(langue))} €`,
          ],
          [texte.parts, valeurs.parts],
          [texte.reference, valeurs.reference],
        ] as [string, string | undefined][]
      ).filter((ligne): ligne is [string, string] => !!ligne[1])
    : []

  return (
    <details
      className="outlined bg-cream w-full rounded-xl p-4"
      onToggle={(e) => {
        if (!e.currentTarget.open) effacer()
      }}
    >
      <summary className="cursor-pointer font-bold">{texte.titre}</summary>
      <p className="mt-3 text-sm">{texte.aide}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" disabled={attente} onClick={verifier} className="btn btn-principal">
          {attente ? texte.attente : texte.lancer}
        </button>
      </div>
      <div role="status" aria-live="polite" className="mt-3 text-sm break-words">
        {erreur ? <p>{texte.erreur}</p> : null}
        {resultat?.etat === 'non_verifiable' ? (
          <>
            <p className="font-bold">{texte.nonVerifiable}</p>
            <p className="mt-1">
              {resultat.motif === 'aucun_code' ? texte.aucunCode : texte.nonEtabli}
            </p>
          </>
        ) : null}
        {resultat?.etat === 'authentique' ? (
          <>
            <p className="font-bold">{texte.authentique}</p>
            <p className="mt-1">{texte.authentiqueAide}</p>
            <dl className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
              <dt className="font-bold">{texte.emetteur}</dt>
              <dd>{resultat.emetteur}</dd>
              <dt className="font-bold">{texte.signeLe}</dt>
              <dd>
                {new Date(`${resultat.signeLe}T00:00:00Z`).toLocaleDateString(locale(langue), {
                  timeZone: 'UTC',
                })}
              </dd>
              {lignes.map(([nom, valeur]) => (
                <div key={nom} className="contents">
                  <dt className="font-bold">{nom}</dt>
                  <dd>{valeur}</dd>
                </div>
              ))}
            </dl>
            {lignes.length === 0 ? <p className="mt-2">{texte.sansValeur}</p> : null}
          </>
        ) : null}
        {resultat ? (
          <>
            <p className="mt-3 text-xs">{texte.temporaire}</p>
            <button type="button" className="mt-2 underline" onClick={effacer}>
              {texte.effacer}
            </button>
          </>
        ) : null}
      </div>
    </details>
  )
}
