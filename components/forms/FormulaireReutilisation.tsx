'use client'
import { useId, useState } from 'react'
import {
  listerPiecesReutilisables,
  copierPiece,
  type EtatReutilisation,
} from '@/lib/garant/action-reutilisation'
import { reutilisation as texte } from '@/lib/content/reutilisation'
import { natures } from '@/lib/content/garant'
import { tailleLisible } from '@/lib/garant/validation'

export function FormulaireReutilisation({ dossierId }: { dossierId: string }) {
  const id = useId()
  const [etat, setEtat] = useState<EtatReutilisation | null>(null)
  const [attente, setAttente] = useState(false)
  const [lien, setLien] = useState('')
  async function executer(formulaire: HTMLFormElement, copie: boolean) {
    if (attente) return
    setAttente(true)
    try {
      const donnees = new FormData(formulaire)
      setEtat(await (copie ? copierPiece(donnees) : listerPiecesReutilisables(donnees)))
    } catch {
      setEtat({ statut: 'erreur', message: texte.erreur })
    } finally {
      setAttente(false)
    }
  }
  return (
    <section className="bg-sky outlined shadow-brut mt-8 rounded-[18px] p-5">
      <h3 className="font-display text-xl uppercase">{texte.titre}</h3>
      <p className="mt-3 text-sm leading-relaxed">{texte.aide}</p>
      <p className="mt-3 text-sm leading-relaxed">{texte.separation}</p>
      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          void executer(event.currentTarget, etat?.statut === 'liste')
        }}
      >
        <input type="hidden" name="dossier" value={dossierId} />
        <div>
          <label htmlFor={`${id}-lien`} className="block text-sm font-bold">
            {texte.lien}
          </label>
          <input
            id={`${id}-lien`}
            type="url"
            name="lien_source"
            value={lien}
            onChange={(event) => {
              setLien(event.target.value)
              setEtat(null)
            }}
            required
            maxLength={4096}
            autoComplete="off"
            spellCheck={false}
            disabled={attente}
            className="bg-paper outlined mt-2 w-full min-w-0 rounded-xl p-3 text-sm"
          />
        </div>
        {etat?.statut === 'liste' && etat.pieces.length > 0 ? (
          <>
            <div>
              <label htmlFor={`${id}-piece`} className="block text-sm font-bold">
                {texte.piece}
              </label>
              <select
                id={`${id}-piece`}
                name="piece"
                required
                disabled={attente}
                className="bg-paper outlined mt-2 w-full min-w-0 rounded-xl p-3 text-sm"
                defaultValue=""
              >
                <option value="">{texte.piece}</option>
                {etat.pieces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {natures.find((n) => n.valeur === p.nature)?.libelle} ·{' '}
                    {new Date(p.date).toLocaleDateString('fr-FR')} · {tailleLisible(p.taille)}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="consentement"
                value="copie-v1"
                required
                disabled={attente}
                className="accent-cobalt mt-1 size-5 shrink-0"
              />
              {texte.consentement}
            </label>
          </>
        ) : null}
        <button
          className="bg-cobalt text-paper outlined shadow-brut hover:shadow-brut-sm rounded-xl px-5 py-3 text-sm font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50 motion-reduce:transform-none"
          type="submit"
          disabled={attente || (etat?.statut === 'liste' && !etat.pieces.length)}
        >
          {attente ? texte.attente : etat?.statut === 'liste' ? texte.copier : texte.chercher}
        </button>
        <p
          role={etat?.statut === 'erreur' ? 'alert' : 'status'}
          className="text-sm font-medium"
          aria-live="polite"
        >
          {etat?.statut === 'erreur'
            ? etat.message
            : etat?.statut === 'copie'
              ? texte.succes
              : etat?.statut === 'liste' && !etat.pieces.length
                ? texte.vide
                : ''}
        </p>
      </form>
    </section>
  )
}
