'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { ocr } from '@/lib/content/ocr'
import { analyserPagesOcr } from '@/lib/ocr/selection'
import { lireResultatOcr } from '@/lib/ocr/lecture-resultat'
import type { ResultatOcr } from '@/lib/ocr/resultat'

/** Une autre piece ne reutilise ni consentement, ni requete, ni transcription. */
export function LectureOcr({ pieceId }: { pieceId: string }) {
  return <LecturePiece key={pieceId} pieceId={pieceId} />
}

function LecturePiece({ pieceId }: { pieceId: string }) {
  const aidePages = useId()
  const caseAccord = useRef<HTMLInputElement | null>(null)
  const [accord, consentir] = useState(false)
  const [attente, patienter] = useState(false)
  const [erreur, echouer] = useState(false)
  const [interrompue, interrompre] = useState(false)
  const [saisie, saisir] = useState('')
  const [recherche, rechercher] = useState('')
  const [numero, choisir] = useState(1)
  const [resultat, afficher] = useState<ResultatOcr | null>(null)
  const requete = useRef<AbortController | null>(null)
  let selection: number[] | null = null,
    valide = true
  try {
    selection = analyserPagesOcr(saisie)
  } catch {
    valide = false
  }
  function effacer() {
    requete.current?.abort()
    requete.current = null
    patienter(false)
    afficher(null)
    consentir(false)
    rechercher('')
    echouer(false)
    interrompre(false)
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

  async function lire() {
    if (!accord || !valide || requete.current) return
    const controleur = new AbortController()
    const signal = AbortSignal.any([controleur.signal, AbortSignal.timeout(65000)])
    requete.current = controleur
    patienter(true)
    echouer(false)
    interrompre(false)
    afficher(null)
    rechercher('')
    try {
      const reponse = await fetch(`/espace/pieces/${pieceId}`, {
        method: 'POST',
        headers: {
          'X-Cloison-Ocr': 'lecture-explicite',
          ...(selection ? { 'X-Cloison-Ocr-Pages': selection.join(',') } : {}),
        },
        cache: 'no-store',
        redirect: 'error',
        signal,
      })
      const donnees = await lireResultatOcr(reponse, signal, selection)
      if (requete.current === controleur && !controleur.signal.aborted && !document.hidden) {
        afficher(donnees)
        choisir(donnees.pages[0]!.page)
      }
    } catch {
      if (requete.current === controleur && !controleur.signal.aborted) echouer(true)
    } finally {
      // Une reponse tardive ne doit pas liberer ou modifier la nouvelle lecture.
      if (requete.current === controleur) {
        requete.current = null
        patienter(false)
      }
    }
  }
  const pages =
    resultat?.pages.filter((p) =>
      p.texte.toLocaleLowerCase('fr-FR').includes(recherche.trim().toLocaleLowerCase('fr-FR')),
    ) ?? []
  const page = pages.find((p) => p.page === numero) ?? pages[0]
  const position = page ? pages.indexOf(page) : -1
  return (
    <details
      className="outlined bg-cream w-full rounded-xl p-4"
      onToggle={(e) => {
        if (!e.currentTarget.open) effacer()
      }}
    >
      <summary className="cursor-pointer font-bold">{ocr.titre}</summary>
      <p className="mt-3 text-sm">{ocr.aide}</p>
      <label className="mt-3 block text-sm font-bold">
        {ocr.pages}
        <input
          type="text"
          value={saisie}
          maxLength={160}
          disabled={attente}
          aria-invalid={!valide}
          aria-describedby={aidePages}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            effacer()
            saisir(e.target.value)
          }}
          className="outlined bg-paper mt-1 block w-full rounded-lg px-3 py-2 font-normal"
        />
      </label>
      <p id={aidePages} className="mt-2 text-xs">
        {ocr.pagesAide}
      </p>
      {!valide && (
        <p role="alert" className="mt-2 text-sm">
          {ocr.pagesInvalides}
        </p>
      )}
      <label className="mt-3 flex items-start gap-2">
        <input
          type="checkbox"
          ref={caseAccord}
          checked={accord}
          disabled={attente || !valide}
          onChange={(e) => consentir(e.target.checked)}
        />
        {selection ? ocr.accordSelection(selection.join(', ')) : ocr.accord}
      </label>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!accord || !valide || attente}
          onClick={lire}
          className="bg-cobalt text-paper press shadow-brut-xs outlined cursor-pointer rounded-lg px-3 py-2 font-bold disabled:translate-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {attente ? ocr.attente : ocr.lancer}
        </button>
        {attente && (
          <button
            type="button"
            className="underline"
            onClick={() => {
              effacer()
              interrompre(true)
              requestAnimationFrame(() => caseAccord.current?.focus())
            }}
          >
            {ocr.interrompre}
          </button>
        )}
      </div>
      <div role="status" aria-live="polite" className="mt-2 text-sm">
        {erreur ? ocr.erreur : interrompue ? ocr.interrompue : resultat ? ocr.temporaire : ''}
      </div>
      {resultat && (
        <div className="mt-3 break-words">
          <p className="text-xs">
            {ocr.modele} : {resultat.modele}
          </p>
          <p className="text-xs break-all">
            {ocr.empreinte} : {resultat.empreinte}
          </p>
          <label className="mt-3 block text-sm font-bold">
            {ocr.rechercher}
            <input
              type="search"
              maxLength={120}
              value={recherche}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => rechercher(e.target.value)}
              className="outlined bg-paper mt-1 block w-full rounded-lg px-3 py-2 font-normal"
            />
          </label>
          {page ? (
            <>
              <label className="mt-3 block text-sm font-bold">
                {ocr.choisirPage}
                <select
                  value={page.page}
                  onChange={(e) => choisir(Number(e.target.value))}
                  className="outlined bg-paper mt-1 block w-full rounded-lg px-3 py-2"
                >
                  {pages.map((p) => (
                    <option key={p.page} value={p.page}>
                      {ocr.page} {p.page}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <button
                  type="button"
                  disabled={position <= 0}
                  onClick={() => choisir(pages[position - 1]!.page)}
                  className="underline disabled:opacity-50"
                >
                  {ocr.precedente}
                </button>
                <span role="status">{ocr.position(position + 1, pages.length)}</span>
                <button
                  type="button"
                  disabled={position >= pages.length - 1}
                  onClick={() => choisir(pages[position + 1]!.page)}
                  className="underline disabled:opacity-50"
                >
                  {ocr.suivante}
                </button>
              </div>
              <section className="mt-3" aria-label={`${ocr.page} ${page.page}`}>
                <h3 className="font-bold">
                  {ocr.page} {page.page}
                </h3>
                <p className="whitespace-pre-wrap">{page.texte || ocr.vide}</p>
              </section>
            </>
          ) : (
            <p role="status" className="mt-3">
              {ocr.aucunePage}
            </p>
          )}
          <button
            type="button"
            className="mt-3 underline"
            onClick={() => {
              effacer()
              requestAnimationFrame(() => caseAccord.current?.focus())
            }}
          >
            {ocr.effacer}
          </button>
        </div>
      )}
    </details>
  )
}
