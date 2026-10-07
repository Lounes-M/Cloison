'use client'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import {
  lireCleRemise,
  preuveRemise,
  ouvrirRemise,
  reponseRemise,
} from '@/lib/droits/remise-format'
import { remiseDroits as texte } from '@/lib/content/remise-droits'

export function Remise() {
  const acces = useRef<{ id: string; jeton: string; preuve?: string } | null>(null)
  const liens = useRef<string[]>([])
  const expiration = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controle = useRef<AbortController | null>(null)
  const champ = useRef<HTMLInputElement>(null)
  const [fichiers, setFichiers] = useState<{ nom: string; url: string }[]>([])
  const [occupe, setOccupe] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const p = new URLSearchParams(location.hash.slice(1))
    if (
      z.uuid().safeParse(p.get('id')).success &&
      /^[A-Za-z0-9_-]{43}$/.test(p.get('jeton') ?? '') &&
      [...p.keys()].length === 2
    )
      acces.current = { id: p.get('id')!, jeton: p.get('jeton')! }
    history.replaceState(null, '', location.pathname)
    const nettoyer = () => {
      controle.current?.abort()
      if (expiration.current) clearTimeout(expiration.current)
      for (const url of liens.current) URL.revokeObjectURL(url)
      liens.current = []
      acces.current = null
      if (champ.current) champ.current.value = ''
    }
    window.addEventListener('pagehide', nettoyer)
    return () => {
      nettoyer()
      window.removeEventListener('pagehide', nettoyer)
    }
  }, [])
  async function appeler(confirmer: boolean, signal: AbortSignal, telecharger = false) {
    const r = await fetch('/api/droits/remise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...acces.current, confirmer, telecharger }),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal,
    })
    if (!r.ok) throw new Error()
    return r
  }
  async function ouvrir() {
    if (occupe) return
    if (!acces.current || !champ.current) {
      setMessage(texte.erreur)
      return
    }
    setOccupe(true)
    setMessage('')
    const c = new AbortController()
    controle.current = c
    const signal = AbortSignal.any([c.signal, AbortSignal.timeout(60000)])
    let cle: Uint8Array<ArrayBuffer> | undefined
    let archive: Uint8Array<ArrayBuffer> | undefined
    let contenus: Map<string, Uint8Array<ArrayBuffer>> | undefined
    try {
      cle = lireCleRemise(champ.current.value.trim())
      champ.current.value = ''
      acces.current.preuve = await preuveRemise(cle, acces.current.id)
      const droit = reponseRemise.parse(await (await appeler(false, signal)).json())
      if (droit.id !== acces.current.id) throw new Error()
      const r = await appeler(false, signal, true)
      if (
        !r.ok ||
        !r.body ||
        (r.headers.has('content-length') &&
          Number(r.headers.get('content-length')) !== droit.taille)
      )
        throw new Error()
      archive = new Uint8Array(droit.taille)
      const lecteur = r.body.getReader()
      let total = 0
      try {
        for (;;) {
          const { done, value } = await lecteur.read()
          signal.throwIfAborted()
          if (done) break
          if (total + value.length > archive.length) throw new Error()
          archive.set(value, total)
          total += value.length
        }
      } finally {
        void lecteur.cancel().catch(() => {})
        lecteur.releaseLock()
      }
      if (total !== archive.length) throw new Error()
      contenus = await ouvrirRemise(archive, cle, droit)
      signal.throwIfAborted()
      const ouverts = [...contenus].map(([nom, contenu]) => {
        const url = URL.createObjectURL(new Blob([contenu], { type: 'application/octet-stream' }))
        liens.current.push(url)
        return { nom, url }
      })
      setFichiers(ouverts)
      expiration.current = setTimeout(
        () => {
          for (const url of liens.current) URL.revokeObjectURL(url)
          liens.current = []
          acces.current = null
          setFichiers([])
          setMessage(texte.erreur)
        },
        Math.max(0, Date.parse(droit.expireLe) - Date.now()),
      )
    } catch {
      setMessage(texte.erreur)
    } finally {
      cle?.fill(0)
      archive?.fill(0)
      for (const b of contenus?.values() ?? []) b.fill(0)
      setOccupe(false)
    }
  }
  async function confirmer() {
    setOccupe(true)
    try {
      const r = await (await appeler(true, AbortSignal.timeout(15000))).json()
      if (r?.recu !== true) throw new Error()
      setMessage(texte.confirme)
    } catch {
      setMessage(texte.erreur)
    } finally {
      setOccupe(false)
    }
  }
  return (
    <section className="mx-auto max-w-xl space-y-6 px-4 py-12">
      <h1 className="font-display text-3xl">{texte.titre}</h1>
      <p>{texte.introduction}</p>
      {fichiers.length === 0 ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void ouvrir()
          }}
          className="space-y-4"
        >
          <label className="block" htmlFor="cle-remise">
            {texte.cle}
          </label>
          <input
            ref={champ}
            id="cle-remise"
            type="password"
            autoComplete="off"
            spellCheck={false}
            required
            maxLength={44}
            className="rounded-brut border-ink bg-paper w-full border-2 p-3"
          />
          <button
            disabled={occupe}
            className="rounded-brut border-ink bg-sun shadow-brut-xs border-2 px-4 py-3 font-semibold disabled:opacity-50"
            type="submit"
          >
            {occupe ? texte.attente : texte.ouvrir}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">{texte.disponibles}</h2>
          <ul className="space-y-3">
            {fichiers.map((f) => (
              <li key={f.nom}>
                <a
                  className="inline-flex min-h-11 items-center py-2 underline"
                  href={f.url}
                  download={f.nom}
                >
                  {texte.telecharger} {f.nom}
                </a>
              </li>
            ))}
          </ul>
          <button
            disabled={occupe}
            className="rounded-brut border-ink bg-sun shadow-brut-xs border-2 px-4 py-3 font-semibold disabled:opacity-50"
            onClick={() => void confirmer()}
          >
            {texte.confirmer}
          </button>
        </div>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
      <p className="text-sm">{texte.confidentialite}</p>
      <p className="text-sm">{texte.limite}</p>
      <button
        className="inline-flex min-h-11 items-center py-2 underline"
        onClick={() => location.replace('/remise-donnees')}
      >
        {texte.effacer}
      </button>
    </section>
  )
}
