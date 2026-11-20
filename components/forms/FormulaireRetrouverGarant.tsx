'use client'
import { useActionState } from 'react'
import { retrouverMonLienGarant } from '@/lib/garant/action-retrouver'
import { continuite as continuiteFr } from '@/lib/content/continuite'
import { continuite as continuiteEn } from '@/lib/content/en/continuite'
import { choisir } from '@/lib/i18n'
import { useLangue } from '@/components/langue/LangueContexte'

export function FormulaireRetrouverGarant() {
  const langue = useLangue()
  const t = choisir(langue, continuiteFr, continuiteEn).garant
  const [etat, action, pending] = useActionState(retrouverMonLienGarant, {})
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl">{t.titre}</h2>
      <p className="mt-2 text-sm leading-relaxed">{t.aide}</p>
      <form action={action} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="langue" value={langue} />
        <label htmlFor="email-garant">{t.email}</label>
        <input
          className="outlined bg-paper rounded-lg p-3"
          id="email-garant"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={180}
        />
        <label htmlFor="reference-garant">{t.reference}</label>
        <input
          className="outlined bg-paper rounded-lg p-3"
          id="reference-garant"
          name="reference"
          required
          maxLength={100}
        />
        <button disabled={pending} className="bg-ink text-paper rounded-lg p-3 font-bold">
          {t.envoyer}
        </button>
        {etat.message ? <p role="status">{etat.message}</p> : null}
      </form>
    </section>
  )
}
