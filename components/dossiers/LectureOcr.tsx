'use client'
import { useEffect, useRef, useState } from 'react'
import { ocr } from '@/lib/content/ocr'
import type { LectureOcr as Resultat } from '@/lib/ocr/openrouter'

export function LectureOcr({ pieceId }: { pieceId: string }) {
  const [accord, consentir] = useState(false)
  const [attente, patienter] = useState(false)
  const [erreur, echouer] = useState(false)
  const [resultat, afficher] = useState<Resultat | null>(null)
  const requete = useRef<AbortController | null>(null)
  useEffect(() => {
    const effacer = () => {
      requete.current?.abort()
      afficher(null)
      consentir(false)
    }
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
  }, [pieceId])
  async function lire() {
    if (!accord || requete.current) return
    const controleur = new AbortController()
    requete.current = controleur
    patienter(true)
    echouer(false)
    afficher(null)
    try {
      const reponse = await fetch(`/espace/pieces/${pieceId}`, {
        method: 'POST',
        headers: { 'X-Cloison-Ocr': 'lecture-explicite' },
        cache: 'no-store',
        signal: controleur.signal,
      })
      if (!reponse.ok) throw new Error()
      const donnees = await reponse.json()
      if (!controleur.signal.aborted) afficher(donnees)
    } catch {
      if (!controleur.signal.aborted) echouer(true)
    } finally {
      requete.current = null
      patienter(false)
    }
  }
  return (
    <details
      className="outlined bg-cream w-full rounded-xl p-4"
      onToggle={(e) => {
        if (!e.currentTarget.open) {
          requete.current?.abort()
          afficher(null)
          consentir(false)
        }
      }}
    >
      <summary className="cursor-pointer font-bold">{ocr.titre}</summary>
      <p className="mt-3 text-sm">{ocr.aide}</p>
      <label className="mt-3 flex items-start gap-2">
        <input
          type="checkbox"
          checked={accord}
          disabled={attente}
          onChange={(e) => consentir(e.target.checked)}
        />
        {ocr.accord}
      </label>
      <button
        type="button"
        disabled={!accord || attente}
        onClick={lire}
        className="bg-cobalt text-paper press shadow-brut-xs outlined mt-3 cursor-pointer rounded-lg px-3 py-2 font-bold disabled:translate-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {attente ? ocr.attente : ocr.lancer}
      </button>
      <div role="status" aria-live="polite">
        {erreur ? ocr.erreur : resultat ? ocr.temporaire : ''}
      </div>
      {resultat && (
        <div className="mt-3 break-words">
          <p className="text-xs">
            {ocr.modele} : {resultat.modele}
          </p>
          <p className="text-xs break-all">
            {ocr.empreinte} : {resultat.empreinte}
          </p>
          {resultat.pages.map((p) => (
            <section key={p.page} className="mt-3">
              <h3 className="font-bold">
                {ocr.page} {p.page}
              </h3>
              <p className="whitespace-pre-wrap">{p.texte}</p>
            </section>
          ))}
          <button type="button" className="mt-3 underline" onClick={() => afficher(null)}>
            {ocr.effacer}
          </button>
        </div>
      )}
    </details>
  )
}
