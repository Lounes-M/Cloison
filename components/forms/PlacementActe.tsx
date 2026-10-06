'use client'
import { useRef, useState } from 'react'
import { apercevoirActe } from '@/lib/signature/action-apercu'
import type { ApercuActe } from '@/lib/signature/apercu-types'
import { bornerPlacement } from '@/lib/signature/placement'
import { CHAMP_SIGNATURE, PAGES_ACTE_MAX } from '@/lib/signature/position'
import { signature as t } from '@/lib/content/signature'

export function PlacementActe({ dossier, disabled }: { dossier: string; disabled: boolean }) {
  const fichier = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const [apercu, setApercu] = useState<ApercuActe>()
  const [page, setPage] = useState('1')
  const [x, setX] = useState('40')
  const [y, setY] = useState('40')
  const [chargement, setChargement] = useState(false)
  const [message, setMessage] = useState('')
  const dimensions = apercu?.pages[Number(page) - 1]
  const visible = apercu?.page === Number(page) && dimensions
  const valide =
    dimensions &&
    [x, y].every((v) => v !== '' && Number.isSafeInteger(Number(v)) && Number(v) >= 0) &&
    Number(x) + CHAMP_SIGNATURE.largeur <= dimensions.largeur &&
    Number(y) + CHAMP_SIGNATURE.hauteur <= dimensions.hauteur
  function invalider() {
    generation.current++
    setChargement(false)
    setApercu(undefined)
    setMessage('')
  }
  function placer(nx: number, ny: number) {
    if (!dimensions) return
    const p = bornerPlacement(nx, ny, dimensions.largeur, dimensions.hauteur)
    setX(String(p.x))
    setY(String(p.y))
  }
  async function afficher() {
    const actuelle = ++generation.current
    setChargement(true)
    setApercu(undefined)
    setMessage('')
    try {
      const form = new FormData()
      form.set('dossier', dossier)
      form.set('page', page)
      const pdf = fichier.current?.files?.[0]
      if (!pdf) throw new Error()
      form.set('pdf', pdf)
      const resultat = await apercevoirActe(form)
      if (actuelle !== generation.current) return
      setApercu(resultat.apercu)
      setMessage(resultat.message)
    } catch {
      if (actuelle === generation.current) setMessage(t.apercuErreur)
    } finally {
      if (actuelle === generation.current) setChargement(false)
    }
  }
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-4">
      <label>
        {t.fichier}
        <input
          ref={fichier}
          className="mt-2 block w-full"
          name="pdf"
          type="file"
          accept="application/pdf"
          required
          onChange={() => {
            invalider()
            setPage('1')
            setX('40')
            setY('40')
          }}
        />
      </label>
      <p className="text-muted text-sm">{t.placement}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {(['page', 'x', 'y'] as const).map((nom) => (
          <label key={nom}>
            {t[nom]}
            <input
              className="border-ink bg-paper mt-2 w-full rounded-xl border-2 px-4 py-3"
              name={nom}
              type="number"
              min={nom === 'page' ? 1 : 0}
              max={nom === 'page' ? PAGES_ACTE_MAX : 10000}
              step={1}
              value={{ page, x, y }[nom]}
              required
              onChange={(e) => {
                if (nom === 'page') {
                  invalider()
                  setPage(e.target.value)
                } else if (nom === 'x') setX(e.target.value)
                else setY(e.target.value)
              }}
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void afficher()}
        disabled={disabled || chargement}
        className="press outlined bg-paper rounded-brut justify-self-start px-5 py-3 font-bold disabled:opacity-60"
      >
        {chargement ? t.apercuAttente : t.apercu}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {visible && (
        <>
          <p className="text-muted text-sm">{t.apercuAide}</p>
          <button
            type="button"
            aria-label={t.apercuZone}
            aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
            className="border-ink relative block w-full overflow-hidden border-2 bg-white focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
            style={{ aspectRatio: `${dimensions.largeur} / ${dimensions.hauteur}` }}
            onClick={(e) => {
              if (e.detail === 0) return
              const r = e.currentTarget.getBoundingClientRect()
              placer(
                ((e.clientX - r.left - e.currentTarget.clientLeft) / e.currentTarget.clientWidth) *
                  dimensions.largeur -
                  CHAMP_SIGNATURE.largeur / 2,
                ((e.clientY - r.top - e.currentTarget.clientTop) / e.currentTarget.clientHeight) *
                  dimensions.hauteur -
                  CHAMP_SIGNATURE.hauteur / 2,
              )
            }}
            onKeyDown={(e) => {
              const d = (
                {
                  ArrowLeft: [-1, 0],
                  ArrowRight: [1, 0],
                  ArrowUp: [0, -1],
                  ArrowDown: [0, 1],
                } as Record<string, number[]>
              )[e.key]
              if (!d) return
              e.preventDefault()
              const pas = e.shiftKey ? 10 : 1
              placer((Number(x) || 0) + d[0]! * pas, (Number(y) || 0) + d[1]! * pas)
            }}
          >
            {/* Image temporaire, sans optimisation ni transfert vers un autre service. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/png;base64,${apercu.png}`}
              alt={t.apercuImage}
              className="pointer-events-none absolute inset-0 h-full w-full"
              draggable={false}
            />
            {valide && (
              <span
                className="border-cobalt bg-cobalt/15 text-cobalt pointer-events-none absolute flex items-center justify-center overflow-hidden border-2 text-[10px] font-bold"
                style={{
                  left: `${(Number(x) / dimensions.largeur) * 100}%`,
                  top: `${(Number(y) / dimensions.hauteur) * 100}%`,
                  width: `${(CHAMP_SIGNATURE.largeur / dimensions.largeur) * 100}%`,
                  height: `${(CHAMP_SIGNATURE.hauteur / dimensions.hauteur) * 100}%`,
                }}
              >
                {t.apercuChamp}
              </span>
            )}
          </button>
          {!valide && <p role="alert">{t.apercuHorsPage}</p>}
          <p className="text-muted text-sm">{t.apercuConfidentialite}</p>
        </>
      )}
    </fieldset>
  )
}
