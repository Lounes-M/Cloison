'use client'
import { useActionState } from 'react'
import { preparerActe, validerActe, reprendreDepotActe } from '@/lib/signature/actions'
import { signature as t } from '@/lib/content/signature'
import Link from 'next/link'
export function FormulaireActe({ dossier }: { dossier: string }) {
  const [etat, action, attente] = useActionState(preparerActe, { message: '' })
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="dossier" value={dossier} />
      <label>
        {t.fichier}
        <input
          className="mt-2 block w-full"
          name="pdf"
          type="file"
          accept="application/pdf"
          required
          disabled={attente}
        />
      </label>
      <label>
        {t.telephone}
        <input
          className="border-ink bg-paper mt-2 w-full rounded-xl border-2 px-4 py-3"
          name="telephone"
          type="tel"
          placeholder="+33600000000"
          required
          pattern="\+[1-9][0-9]{7,14}"
          disabled={attente}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        {(['page', 'x', 'y'] as const).map((n) => (
          <label key={n}>
            {t[n]}
            <input
              className="border-ink bg-paper mt-2 w-full rounded-xl border-2 px-4 py-3"
              name={n}
              type="number"
              min={n === 'page' ? 1 : 0}
              max={n === 'page' ? 1000 : 10000}
              defaultValue={n === 'page' ? 1 : 40}
              required
              disabled={attente}
            />
          </label>
        ))}
      </div>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="accord" required disabled={attente} />
        {t.accordAgence}
      </label>
      <button
        className="press outlined bg-cobalt shadow-brut rounded-brut px-6 py-3 font-bold text-white disabled:opacity-60"
        disabled={attente}
      >
        {attente ? t.attente : t.envoyer}
      </button>
      <p role="status">{etat.message}</p>
      {etat.id ? <Link href={`/espace/actes/${etat.id}`}>{t.suivi}</Link> : null}
    </form>
  )
}
export function ValidationActe({
  id,
  dossier,
  empreinte,
}: {
  id: string
  dossier: string
  empreinte: string
}) {
  const [etat, action, attente] = useActionState(validerActe, { message: '' })
  return (
    <form action={action} className="mt-6 grid gap-4">
      <input type="hidden" name="acte" value={id} />
      <input type="hidden" name="dossier" value={dossier} />
      <input type="hidden" name="empreinte" value={empreinte} />
      <label className="flex items-start gap-3">
        <input type="checkbox" name="accord" disabled={attente} />
        {t.accordGarant}
      </label>
      <div className="flex flex-wrap gap-4">
        <button
          name="decision"
          value="accepter"
          className="press outlined bg-cobalt shadow-brut rounded-brut px-6 py-3 font-bold text-white disabled:opacity-60"
          disabled={attente}
        >
          {t.accepter}
        </button>
        <button
          name="decision"
          value="refuser"
          className="press outlined bg-paper rounded-brut px-6 py-3 font-bold disabled:opacity-60"
          disabled={attente}
        >
          {t.refuser}
        </button>
      </div>
      <p role="status">{etat.message}</p>
    </form>
  )
}

export function RepriseActe({ id }: { id: string }) {
  const [etat, action, attente] = useActionState(reprendreDepotActe, { message: '' })
  return (
    <form action={action} className="mt-6 grid gap-4">
      <input type="hidden" name="acte" value={id} />
      <label>
        {t.fichier}
        <input
          type="file"
          name="pdf"
          accept="application/pdf"
          required
          disabled={attente}
          className="mt-2 block w-full"
        />
      </label>
      <button
        disabled={attente}
        className="press outlined bg-cobalt rounded-brut px-5 py-3 font-bold text-white"
      >
        {t.reprendre}
      </button>
      <p role="status">{etat.message}</p>
    </form>
  )
}
