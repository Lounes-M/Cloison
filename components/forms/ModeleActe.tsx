'use client'
import Link from 'next/link'
import { useActionState, useRef, useState } from 'react'
import { telechargerModeleActe } from '@/lib/acte/actions'
import { preparerActe } from '@/lib/signature/actions'
import { acte as t } from '@/lib/content/acte'
import { signature as ts } from '@/lib/content/signature'

const champ = 'border-ink bg-paper mt-2 w-full rounded-xl border-2 px-4 py-3'
const bouton =
  'press outlined rounded-brut px-6 py-3 font-bold disabled:opacity-60 bg-paper shadow-brut'

function Texte({
  nom,
  libelle,
  type = 'text',
  requis = true,
  defaut,
  ...autres
}: {
  nom: string
  libelle: string
  type?: string
  requis?: boolean
  defaut?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      {libelle}
      <input
        className={champ}
        name={nom}
        type={type}
        required={requis}
        defaultValue={defaut}
        {...autres}
      />
    </label>
  )
}

export function ModeleActe({
  dossier,
  locataire,
  aujourdHui,
  signatureOuverte,
}: {
  dossier: string
  locataire: string
  aujourdHui: string
  signatureOuverte: boolean
}) {
  const formulaire = useRef<HTMLFormElement>(null)
  const [message, setMessage] = useState('')
  const [attente, setAttente] = useState(false)
  const [etat, soumettre, envoi] = useActionState(preparerActe, { message: '' })

  async function telecharger() {
    const form = formulaire.current
    if (!form) return
    // Le telephone et l'accord ne servent qu'a l'envoi : le telechargement ne les exige pas.
    for (const element of Array.from(form.elements)) {
      if (
        (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) &&
        !element.closest('[data-envoi]') &&
        !element.reportValidity()
      )
        return
    }
    setAttente(true)
    setMessage('')
    try {
      const r = await telechargerModeleActe(new FormData(form))
      setMessage(r.message)
      if (!r.pdf) return
      const octets = Uint8Array.from(atob(r.pdf), (c) => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' }))
      const lien = document.createElement('a')
      lien.href = url
      lien.download = r.nom ?? 'acte-de-cautionnement.pdf'
      lien.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      setMessage(t.erreur)
    } finally {
      setAttente(false)
    }
  }

  const occupe = attente || envoi
  return (
    <form ref={formulaire} action={soumettre} className="grid gap-6">
      <input type="hidden" name="dossier" value={dossier} />
      <input type="hidden" name="source" value="modele" />

      <fieldset disabled={occupe} className="grid min-w-0 gap-4">
        <legend className="font-display mb-2 text-xl uppercase">{t.sections.caution}</legend>
        <label>
          {t.champs.civilite}
          <select className={champ} name="civilite" required defaultValue="">
            <option value="" disabled />
            <option value="madame">{t.champs.madame}</option>
            <option value="monsieur">{t.champs.monsieur}</option>
          </select>
        </label>
        <Texte nom="naissance_le" libelle={t.champs.naissanceLe} type="date" max={aujourdHui} />
        <Texte nom="naissance_lieu" libelle={t.champs.naissanceLieu} maxLength={160} />
      </fieldset>

      <fieldset disabled={occupe} className="grid min-w-0 gap-4">
        <legend className="font-display mb-2 text-xl uppercase">{t.sections.bail}</legend>
        <Texte nom="locataire" libelle={t.champs.locataire} defaut={locataire} maxLength={240} />
        <Texte nom="bailleur_nom" libelle={t.champs.bailleurNom} maxLength={240} />
        <Texte nom="bailleur_adresse" libelle={t.champs.bailleurAdresse} maxLength={400} />
        <Texte nom="logement" libelle={t.champs.logement} maxLength={400} />
        <label>
          {t.champs.coCautions}
          <textarea className={champ} name="co_cautions" rows={2} maxLength={800} />
        </label>
      </fieldset>

      <fieldset disabled={occupe} className="grid min-w-0 gap-4">
        <legend className="font-display mb-2 text-xl uppercase">{t.sections.loyer}</legend>
        <Texte
          nom="loyer"
          libelle={t.champs.loyer}
          inputMode="decimal"
          pattern="[0-9]{1,9}([,.][0-9]{1,2})?"
        />
        <Texte
          nom="charges"
          libelle={t.champs.charges}
          requis={false}
          inputMode="decimal"
          pattern="[0-9]{1,9}([,.][0-9]{1,2})?"
        />
        <label>
          {t.champs.periodicite}
          <select className={champ} name="periodicite" defaultValue="mois">
            <option value="mois">{t.champs.mois}</option>
            <option value="trimestre">{t.champs.trimestre}</option>
            <option value="an">{t.champs.an}</option>
          </select>
        </label>
        <Texte nom="revision_le" libelle={t.champs.revisionLe} type="date" />
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            {t.champs.irlTrimestre}
            <select className={champ} name="irl_trimestre" required defaultValue="">
              <option value="" disabled />
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? '1er' : `${n}e`}
                </option>
              ))}
            </select>
          </label>
          <Texte
            nom="irl_annee"
            libelle={t.champs.irlAnnee}
            type="number"
            min={2000}
            max={2100}
            defaut={aujourdHui.slice(0, 4)}
          />
        </div>
      </fieldset>

      <fieldset disabled={occupe} className="grid min-w-0 gap-4">
        <legend className="font-display mb-2 text-xl uppercase">{t.sections.acte}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Texte nom="fait_lieu" libelle={t.champs.faitLieu} maxLength={120} />
          <Texte nom="fait_le" libelle={t.champs.faitLe} type="date" defaut={aujourdHui} />
        </div>
      </fieldset>

      <div>
        <button type="button" className={bouton} onClick={telecharger} disabled={occupe}>
          {attente ? t.attente : t.telecharger}
        </button>
        <p role="status" className="mt-3">
          {message}
        </p>
      </div>

      {signatureOuverte ? (
        <fieldset data-envoi disabled={occupe} className="grid min-w-0 gap-4 border-t-2 pt-6">
          <label>
            {ts.telephone}
            <input
              className={champ}
              name="telephone"
              type="tel"
              placeholder="+33600000000"
              required
              pattern="\+[1-9][0-9]{7,14}"
            />
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="accord" required />
            {t.accord}
          </label>
          <button className="press outlined bg-cobalt shadow-brut rounded-brut px-6 py-3 font-bold text-white disabled:opacity-60">
            {envoi ? ts.attente : t.soumettre}
          </button>
          <p role="status">{etat.message}</p>
          {etat.id ? <Link href={`/espace/actes/${etat.id}`}>{ts.suivi}</Link> : null}
        </fieldset>
      ) : (
        <p className="text-muted">{t.signatureFermee}</p>
      )}
    </form>
  )
}
