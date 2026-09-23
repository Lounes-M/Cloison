'use client'
import { useEffect, useRef, useState } from 'react'
import { exportsRegistres as t } from '@/lib/content/exports-registres'

export function ExportRegistre({ registre }: { registre: 'archives' | 'reglements' }) {
  const [etat, afficher] = useState<'repos' | 'attente' | 'succes' | 'erreur' | 'limite'>('repos')
  const controleur = useRef<AbortController | null>(null)
  const objet = useRef<string | null>(null)
  const liberation = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      controleur.current?.abort()
      if (liberation.current) clearTimeout(liberation.current)
      if (objet.current) URL.revokeObjectURL(objet.current)
    },
    [],
  )
  async function telecharger() {
    if (controleur.current) return
    const actif = new AbortController()
    const signal = AbortSignal.any([actif.signal, AbortSignal.timeout(55000)])
    controleur.current = actif
    afficher('attente')
    let lecteur: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      const reponse = await fetch(`/espace/exports/${registre}`, {
        cache: 'no-store',
        redirect: 'error',
        signal,
      })
      if (reponse.status === 413) {
        await reponse.body?.cancel()
        if (!actif.signal.aborted) afficher('limite')
        return
      }
      if (
        !reponse.ok ||
        reponse.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'text/csv' ||
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
        if (taille > 2 * 1024 * 1024) throw new Error()
        morceaux.push(new Uint8Array(value))
      }
      if (!taille || actif.signal.aborted) throw new Error()
      signal.throwIfAborted()
      if (objet.current) URL.revokeObjectURL(objet.current)
      objet.current = URL.createObjectURL(new Blob(morceaux, { type: 'text/csv;charset=utf-8' }))
      const lien = document.createElement('a')
      lien.href = objet.current
      lien.download = `cloison-${registre}.csv`
      document.body.append(lien)
      lien.click()
      lien.remove()
      if (liberation.current) clearTimeout(liberation.current)
      liberation.current = setTimeout(() => {
        if (objet.current) URL.revokeObjectURL(objet.current)
        objet.current = null
      }, 60000)
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
    <section className="outlined bg-paper mb-6 rounded-xl p-4" aria-label={t.titre}>
      <h2 className="font-bold">{t.titre}</h2>
      <p className="text-muted mt-2 text-sm">{t.aide}</p>
      <button
        type="button"
        className="lien-espace mt-3"
        disabled={etat === 'attente'}
        onClick={telecharger}
      >
        {etat === 'attente' ? t.attente : t.telecharger}
      </button>
      <p role="status" className="mt-2 text-sm">
        {etat === 'limite'
          ? t.limite
          : etat === 'erreur'
            ? t.erreur
            : etat === 'succes'
              ? t.succes
              : ''}
      </p>
    </section>
  )
}
