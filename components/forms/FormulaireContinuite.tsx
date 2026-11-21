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
}: ({ mode: 'retrouver'; dossierId?: never } | { mode: 'agence'; dossierId: string }) & {
  langue?: Langue
}) {
  const langueDuContexte = useLangue()
  const langue = langueChoisie ?? langueDuContexte
  const continuite = choisir(langue, continuiteFr, continuiteEn)
  const [etat, action, pending] = useActionState(
    mode === 'retrouver' ? retrouverMonDossier : rattacherMonDossier,
    {},
  )
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl">
        {mode === 'retrouver' ? continuite.retrouver : continuite.agence}
      </h2>
      <form action={action} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="langue" value={langue} />
        <input type="hidden" name="dossier" value={dossierId ?? ''} />
        {mode === 'retrouver' ? (
          <>
            <label htmlFor="email-retour">{continuite.email}</label>
            <input
              className="outlined bg-paper rounded-lg p-3"
              id="email-retour"
              name="email"
              type="email"
              required
              maxLength={180}
            />
            <label htmlFor="reference-retour">{continuite.reference}</label>
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
            <p>{continuite.aide}</p>
            <label htmlFor="domaine-agence">{continuite.domaine}</label>
            <input
              className="outlined bg-paper rounded-lg p-3"
              id="domaine-agence"
              name="domaine"
              required
              maxLength={180}
            />
            <label className="flex gap-3">
              <input type="checkbox" name="accord" required />
              {continuite.consentement}
            </label>
          </>
        )}
        <button disabled={pending} className="btn btn-principal">
          {mode === 'retrouver' ? continuite.envoyer : continuite.transmettre}
        </button>
        {etat.message ? <p role="status">{etat.message}</p> : null}
      </form>
    </section>
  )
}
