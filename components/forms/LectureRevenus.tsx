'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { lectureRevenus as texteFr } from '@/lib/content/garant'
import { lectureRevenus as texteEn } from '@/lib/content/en/garant'
import { centsEnSaisie, restitution, type Restitution } from '@/lib/ocr/revenus'
import { choisir, locale } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'

type Etat =
  | { etape: 'pret' }
  | { etape: 'attente' }
  | { etape: 'erreur'; quota: boolean }
  | { etape: 'resultat'; lecture: Restitution; reporte: boolean }

/**
 * Le garant demande une proposition ; il la reporte lui-meme dans le champ.
 *
 * Aucun bouton n'enregistre : le report modifie seulement la valeur du champ,
 * et le formulaire suit son chemin habituel quand le garant clique sur
 * Enregistrer. Le resultat n'est garde ni en base, ni dans le navigateur.
 */
export function LectureRevenus({
  dossierId,
  reporterDansLeChamp,
}: {
  dossierId: string
  /** Ecrit la valeur dans le champ revenu du formulaire, sans l'enregistrer. */
  reporterDansLeChamp: (saisie: string) => void
}) {
  const langue = useLangue()
  const t = choisir(langue, texteFr, texteEn)
  const id = useId()
  const [accord, consentir] = useState(false)
  const [etat, changer] = useState<Etat>({ etape: 'pret' })
  const requete = useRef<AbortController | null>(null)
  useEffect(() => () => requete.current?.abort(), [])

  const euros = (cents: number) =>
    (cents / 100).toLocaleString(locale(langue), {
      minimumFractionDigits: cents % 100 ? 2 : 0,
      maximumFractionDigits: 2,
    })
  const mois = (periode: string) =>
    new Date(`${periode}-01T12:00:00Z`).toLocaleDateString(locale(langue), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })

  async function lire() {
    if (!accord || requete.current) return
    const controleur = new AbortController()
    requete.current = controleur
    changer({ etape: 'attente' })
    try {
      const reponse = await fetch('/garant/lecture', {
        method: 'POST',
        headers: { 'X-Cloison-Lecture': 'revenus-explicite', 'X-Cloison-Dossier': dossierId },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.any([controleur.signal, AbortSignal.timeout(65000)]),
      })
      if (!reponse.ok) {
        changer({ etape: 'erreur', quota: reponse.status === 429 })
        return
      }
      const texte = await reponse.text()
      if (texte.length > 16384) throw new Error('Reponse trop longue')
      changer({ etape: 'resultat', lecture: restitution.parse(JSON.parse(texte)), reporte: false })
    } catch {
      if (!controleur.signal.aborted) changer({ etape: 'erreur', quota: false })
    } finally {
      requete.current = null
      consentir(false)
    }
  }

  function reporter(cents: number) {
    reporterDansLeChamp(centsEnSaisie(cents))
    if (etat.etape === 'resultat') changer({ ...etat, reporte: true })
  }

  const p = etat.etape === 'resultat' ? etat.lecture.proposition : null
  return (
    <details className="outlined bg-paper mt-3 rounded-xl px-4 py-3">
      <summary className="cursor-pointer text-[14px] font-bold">{t.titre}</summary>
      <div className="mt-3 flex flex-col gap-3 text-[13px] font-medium">
        <p className="text-muted">{t.explication}</p>
        <label className="flex cursor-pointer items-start gap-3" htmlFor={`${id}-accord`}>
          <input
            id={`${id}-accord`}
            type="checkbox"
            checked={accord}
            disabled={etat.etape === 'attente'}
            onChange={(e) => consentir(e.target.checked)}
            className="accent-cobalt mt-1 size-4"
          />
          <span>{t.accord}</span>
        </label>
        <button
          type="button"
          onClick={lire}
          disabled={!accord || etat.etape === 'attente'}
          className="btn btn-secondaire self-start"
        >
          {etat.etape === 'attente' ? t.attente : t.lancer}
        </button>
        <div aria-live="polite" className="flex flex-col gap-2">
          {etat.etape === 'erreur' ? (
            <p role="alert" className="message-erreur">
              {etat.quota ? t.quota : t.erreur}
            </p>
          ) : null}
          {etat.etape === 'resultat' && p ? (
            p.revenuCents === null ? (
              <p className="message-erreur">{t.aucun}</p>
            ) : (
              <>
                <p className="text-[15px] font-bold">{t.proposition(euros(p.revenuCents))}</p>
                {p.salaire ? (
                  <p>
                    {t.salaire(
                      euros(p.salaire.moyenneCents),
                      p.salaire.periodes.map(mois).join(', '),
                    )}
                  </p>
                ) : null}
                {p.pension ? (
                  <p>{t.pension(euros(p.pension.montantCents), mois(p.pension.periode))}</p>
                ) : null}
                {p.salaire?.variable ? <p>{t.variable}</p> : null}
                <p className="text-muted">{t.verifier}</p>
                <button
                  type="button"
                  onClick={() => reporter(p.revenuCents!)}
                  className="btn btn-principal self-start"
                >
                  {t.utiliser}
                </button>
                {etat.reporte ? (
                  <p role="status" className="message-succes">
                    {t.reporte}
                  </p>
                ) : null}
              </>
            )
          ) : null}
          {etat.etape === 'resultat' && p?.contradictoires.length ? (
            <p>{t.contradictoires(p.contradictoires.map(mois).join(', '))}</p>
          ) : null}
          {etat.etape === 'resultat' && etat.lecture.illisibles > 0 ? (
            <p>{t.illisibles(etat.lecture.illisibles)}</p>
          ) : null}
        </div>
      </div>
    </details>
  )
}
