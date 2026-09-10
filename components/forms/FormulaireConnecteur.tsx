'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { gererConnecteur, type EtatConnecteur } from '@/lib/connecteurs/action'
import { connecteurs as t } from '@/lib/content/connecteurs'
export function FormulaireConnecteur({ agence, id }: { agence: string; id?: string }) {
  const [etat, afficher] = useState<EtatConnecteur | null>(null),
    [attente, patienter] = useState(false)
  const generation = useRef(0),
    routeur = useRouter()
  useEffect(() => {
    const invalider = () => {
      generation.current++
    }
    const masquer = () => {
      invalider()
      afficher(null)
    }
    const visibilite = () => {
      if (document.hidden) masquer()
    }
    document.addEventListener('visibilitychange', visibilite)
    window.addEventListener('pagehide', masquer)
    return () => {
      invalider()
      document.removeEventListener('visibilitychange', visibilite)
      window.removeEventListener('pagehide', masquer)
    }
  }, [])
  return (
    <form
      className="mt-4 grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (attente) return
        const formulaire = e.currentTarget,
          version = ++generation.current
        patienter(true)
        afficher(null)
        try {
          const resultat = await gererConnecteur(new FormData(formulaire))
          if (version === generation.current) afficher(resultat)
          if (resultat.ok) {
            formulaire.reset()
            routeur.refresh()
          }
        } catch {
          if (version === generation.current) afficher({ ok: false })
        } finally {
          patienter(false)
        }
      }}
    >
      <input type="hidden" name="agence" value={agence} />
      <input type="hidden" name="operation" value={id ? 'revoquer' : 'creer'} />
      {id ? (
        <input type="hidden" name="id" value={id} />
      ) : (
        <label className="grid gap-1 font-semibold">
          {t.nom}
          <input name="nom" required maxLength={80} className="outlined rounded-lg px-3 py-2" />
        </label>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmation" required />
        {t.confirmation}
      </label>
      <button
        disabled={attente}
        className="outlined bg-sky rounded-lg px-4 py-2 font-bold disabled:opacity-50"
      >
        {attente ? t.attente : id ? t.revoquer : t.creer}
      </button>
      {etat && !etat.ok ? (
        <p role="alert">{t.echec}</p>
      ) : etat?.ok && !etat.cle ? (
        <p role="status">{t.succes}</p>
      ) : null}
      {etat?.cle ? (
        <div className="min-w-0">
          <p role="status">{t.conserver}</p>
          <label className="mt-2 grid gap-1 font-bold">
            {t.cle}
            <textarea
              readOnly
              autoComplete="off"
              spellCheck={false}
              value={etat.cle}
              className="outlined w-full rounded-lg p-3 font-mono text-sm"
            />
          </label>
          <button type="button" className="mt-2 underline" onClick={() => afficher(null)}>
            {t.fermer}
          </button>
        </div>
      ) : null}
    </form>
  )
}
