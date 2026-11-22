'use client'
import { PlacementActe } from './PlacementActe'
import { useActionState } from 'react'
import { preparerActe, validerActe, reprendreDepotActe } from '@/lib/signature/actions'
import { signature as tFr } from '@/lib/content/signature'
import Link from 'next/link'
import { signature as tEn } from '@/lib/content/en/signature'
import { choisir } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'
export function FormulaireActe({ dossier }: { dossier: string }) {
  const langue = useLangue()
  const t = choisir(langue, tFr, tEn)

  const [etat, action, attente] = useActionState(preparerActe, { message: '' })
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="dossier" value={dossier} />
      <PlacementActe dossier={dossier} disabled={attente} />
      <label className="text-[14px] font-bold">
        {t.telephone}
        <input
          className="border-ink bg-paper mt-2 w-full rounded-xl border-2 px-4 py-3 font-normal"
          name="telephone"
          type="tel"
          placeholder="+33600000000"
          required
          pattern="\+[1-9][0-9]{7,14}"
          disabled={attente}
        />
      </label>
      <label className="flex items-start gap-3 text-[14px] font-medium">
        <input
          type="checkbox"
          name="accord"
          required
          disabled={attente}
          className="accent-cobalt mt-0.5 size-5 shrink-0"
        />
        {t.accordAgence}
      </label>
      <button className="btn btn-principal" disabled={attente}>
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
  const langue = useLangue()
  const t = choisir(langue, tFr, tEn)

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
        <button name="decision" value="accepter" className="btn btn-principal" disabled={attente}>
          {t.accepter}
        </button>
        <button name="decision" value="refuser" className="btn btn-secondaire" disabled={attente}>
          {t.refuser}
        </button>
      </div>
      <p role="status">{etat.message}</p>
    </form>
  )
}

export function RepriseActe({ id }: { id: string }) {
  const langue = useLangue()
  const t = choisir(langue, tFr, tEn)

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
      <button disabled={attente} className="btn btn-principal">
        {t.reprendre}
      </button>
      <p role="status">{etat.message}</p>
    </form>
  )
}
