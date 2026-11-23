'use client'
import { useActionState } from 'react'
import { retrouverMonDossier, rattacherMonDossier } from '@/lib/locataire/action-continuite'
import { continuite as continuiteFr } from '@/lib/content/continuite'
import { useLangue } from '@/components/langue/LangueContexte'
import { continuite as continuiteEn } from '@/lib/content/en/continuite'
import { choisir, type Langue } from '@/lib/i18n'
export function FormulaireContinuite({
  mode,
  dossierId,
  langue: langueChoisie,
  regle = false,
}: ({ mode: 'retrouver'; dossierId?: never } | { mode: 'agence'; dossierId: string }) & {
  langue?: Langue
  /** Le dossier est déjà réglé : ne plus dire qu’il faudra payer pour inviter le garant. */
  regle?: boolean
}) {
  const langueDuContexte = useLangue()
  const langue = langueChoisie ?? langueDuContexte
  const continuite = choisir(langue, continuiteFr, continuiteEn)
  const [etat, action, pending] = useActionState(
    mode === 'retrouver' ? retrouverMonDossier : rattacherMonDossier,
    {},
  )
  return (
    <section className={mode === 'agence' ? 'panneau-espace mt-6' : 'mt-10'}>
      <h2 className="text-xl font-bold">
        {mode === 'retrouver' ? continuite.retrouver : continuite.agence}
      </h2>
      <form action={action} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="langue" value={langue} />
        <input type="hidden" name="dossier" value={dossierId ?? ''} />
        {mode === 'retrouver' ? (
          <>
            <label htmlFor="email-retour" className="text-[14px] font-bold">
              {continuite.email}
            </label>
            <input
              className="outlined bg-paper rounded-lg p-3"
              id="email-retour"
              name="email"
              type="email"
              required
              maxLength={180}
            />
            <label htmlFor="reference-retour" className="text-[14px] font-bold">
              {continuite.reference}
            </label>
            <input
              className="outlined bg-paper rounded-lg p-3"
              id="reference-retour"
              name="reference"
              required
              maxLength={100}
            />
          </>
        ) : (
          <>
            <p className="text-muted text-[14px] leading-relaxed font-medium">
              {regle ? continuite.aideRegle : continuite.aide}
            </p>
            <label htmlFor="domaine-agence" className="text-[14px] font-bold">
              {continuite.domaine}
            </label>
            <input
              className="outlined bg-paper rounded-lg p-3"
              id="domaine-agence"
              name="domaine"
              required
              maxLength={180}
            />
            <label className="flex gap-3 text-[14px] font-medium">
              <input
                type="checkbox"
                name="accord"
                required
                className="accent-cobalt mt-0.5 size-5 shrink-0"
              />
              {continuite.consentement}
            </label>
          </>
        )}
        <button disabled={pending} className="btn btn-principal self-start">
          {mode === 'retrouver' ? continuite.envoyer : continuite.transmettre}
        </button>
        {etat.message ? <p role="status">{etat.message}</p> : null}
      </form>
    </section>
  )
}
