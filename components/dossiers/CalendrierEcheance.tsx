'use client'
import { useEffect, useRef, useState } from 'react'
import { calendrier } from '@/lib/content/calendrier'

export function CalendrierEcheance({ dossierId }: { dossierId: string }) {
  const [etat, afficher] = useState<'repos' | 'attente' | 'succes' | 'erreur'>('repos')
  const controleur = useRef<AbortController | null>(null)
  const objet = useRef<string | null>(null)
  useEffect(
    () => () => {
      controleur.current?.abort()
      if (objet.current) URL.revokeObjectURL(objet.current)
    },
    [],
  )
  async function telecharger() {
    if (controleur.current) return
    const actif = new AbortController()
    const signal = AbortSignal.any([actif.signal, AbortSignal.timeout(10000)])
    controleur.current = actif
    afficher('attente')
    let lecteur: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      const reponse = await fetch(`/espace/dossiers/${dossierId}/echeance`, {
        cache: 'no-store',
        redirect: 'error',
        signal,
      })
      if (
        !reponse.ok ||
        reponse.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'text/calendar' ||
        !reponse.body
      ) {
        void reponse.body?.cancel().catch(() => {})
        throw new Error()
      }
      lecteur = reponse.body.getReader()
      const morceaux: BlobPart[] = []
      let taille = 0
      for (;;) {
        const { done, value } = await lecteur.read()
        if (done) break
        taille += value.byteLength
        if (taille > 4096) throw new Error()
        morceaux.push(new Uint8Array(value))
      }
      if (!taille || actif.signal.aborted) throw new Error()
      signal.throwIfAborted()
      if (objet.current) URL.revokeObjectURL(objet.current)
      objet.current = URL.createObjectURL(
        new Blob(morceaux, { type: 'text/calendar;charset=utf-8' }),
      )
      const lien = document.createElement('a')
      lien.href = objet.current
      lien.download = 'echeance-cloison.ics'
      document.body.append(lien)
      lien.click()
      lien.remove()
      afficher('succes')
    } catch {
      if (!actif.signal.aborted) afficher('erreur')
    } finally {
      await lecteur?.cancel().catch(() => {})
      lecteur?.releaseLock()
      controleur.current = null
    }
  }
  return (
    <section className="outlined bg-paper mt-6 rounded-xl p-4" aria-label={calendrier.titre}>
      <h2 className="font-bold">{calendrier.titre}</h2>
      <p className="text-muted mt-2 text-sm">{calendrier.aide}</p>
      <button
        type="button"
        className="lien-espace mt-3"
        disabled={etat === 'attente'}
        onClick={telecharger}
      >
        {etat === 'attente' ? calendrier.attente : calendrier.telecharger}
      </button>
      <p role="status" className="mt-2 text-sm">
        {etat === 'erreur' ? calendrier.erreur : etat === 'succes' ? calendrier.succes : ''}
      </p>
    </section>
  )
}
