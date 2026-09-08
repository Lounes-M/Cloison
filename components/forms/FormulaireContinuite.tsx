'use client'
import { useActionState } from 'react'
import { retrouverMonDossier, rattacherMonDossier } from '@/lib/locataire/action-continuite'
import { continuite } from '@/lib/content/continuite'
export function FormulaireContinuite({
  mode,
  dossierId,
}: { mode: 'retrouver'; dossierId?: never } | { mode: 'agence'; dossierId: string }) {
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
        <button disabled={pending} className="bg-ink text-paper rounded-lg p-3 font-bold">
          {mode === 'retrouver' ? continuite.envoyer : continuite.transmettre}
        </button>
        {etat.message ? <p role="status">{etat.message}</p> : null}
      </form>
    </section>
  )
}
