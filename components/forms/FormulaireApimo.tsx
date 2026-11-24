'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLangue } from '@/components/langue/LangueContexte'
import { gererApimo, type EtatApimo } from '@/lib/connecteurs/apimo/action'
import { apimo as tFr } from '@/lib/content/apimo'
import { apimo as tEn } from '@/lib/content/en/apimo'
import { choisir } from '@/lib/i18n'

/**
 * Une operation sur la connexion Apimo de l'agence : enregistrer les
 * identifiants, regler le retour d'etat, ou tout retirer. Le jeton ne revient
 * jamais du serveur : le champ est vide a chaque affichage.
 */
export function FormulaireApimo({
  agence,
  operation,
  retour = false,
  retourOuvert,
}: {
  agence: string
  operation: 'configurer' | 'retour' | 'retirer'
  retour?: boolean
  retourOuvert: boolean
}) {
  const t = choisir(useLangue(), tFr, tEn)
  const [etat, afficher] = useState<EtatApimo | null>(null)
  const [attente, patienter] = useState(false)
  const routeur = useRouter()
  const champ = 'outlined w-full rounded-lg px-3 py-2 font-medium'
  return (
    <form
      className="mt-4 grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (attente) return
        const formulaire = e.currentTarget
        patienter(true)
        afficher(null)
        try {
          const resultat = await gererApimo(new FormData(formulaire))
          afficher(resultat)
          if (resultat.ok) {
            if (operation === 'configurer') formulaire.reset()
            routeur.refresh()
          }
        } catch {
          afficher({ ok: false, motif: 'general' })
        } finally {
          patienter(false)
        }
      }}
    >
      <input type="hidden" name="agence" value={agence} />
      <input type="hidden" name="operation" value={operation} />
      {operation === 'configurer' ? (
        <>
          <label className="grid gap-1 font-semibold">
            {t.fournisseur}
            <input
              name="fournisseur"
              required
              inputMode="numeric"
              pattern="[0-9]{1,10}"
              maxLength={10}
              autoComplete="off"
              className={champ}
            />
          </label>
          <label className="grid gap-1 font-semibold">
            {t.agence}
            <input
              name="agenceApimo"
              required
              inputMode="numeric"
              pattern="[0-9]{1,10}"
              maxLength={10}
              autoComplete="off"
              className={champ}
            />
          </label>
          <label className="grid gap-1 font-semibold">
            {t.jeton}
            <input
              name="jeton"
              type="password"
              required
              minLength={8}
              maxLength={200}
              autoComplete="off"
              spellCheck={false}
              className={`${champ} font-mono`}
            />
            <span className="text-muted text-sm font-medium">{t.jetonAide}</span>
          </label>
        </>
      ) : null}
      {operation === 'retirer' ? (
        <p className="text-muted text-sm font-medium">{t.retirerAide}</p>
      ) : (
        <div>
          <label className="flex items-start gap-2 font-semibold">
            <input type="checkbox" name="retour" defaultChecked={retour} className="mt-1" />
            {t.retour}
          </label>
          <p className="text-muted mt-1 text-sm font-medium">{t.retourAide}</p>
          {retourOuvert ? null : (
            <p className="text-muted mt-1 text-sm font-medium">{t.retourFerme}</p>
          )}
        </div>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmation" required className="mt-1" />
        {t.confirmation}
      </label>
      <button
        disabled={attente}
        className={`btn self-start ${operation === 'configurer' ? 'btn-principal' : 'btn-secondaire'}`}
      >
        {attente
          ? t.attente
          : operation === 'configurer'
            ? t.enregistrer
            : operation === 'retour'
              ? t.reglerRetour
              : t.retirer}
      </button>
      {etat && !etat.ok ? (
        <p role="alert" className="message-erreur">
          {t.echecs[etat.motif]}
        </p>
      ) : etat?.ok ? (
        <p role="status" className="message-succes">
          {t.succes[etat.fait]}
        </p>
      ) : null}
    </form>
  )
}
