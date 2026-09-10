import { FormulaireComplement } from '@/components/forms/FormulaireComplement'
import { complements as t, type Complement } from '@/lib/content/complements'
import { natures } from '@/lib/content/espace'
export function Complements({
  dossierId,
  demandes,
  pieces,
  agence,
  modifiable,
}: {
  dossierId: string
  demandes: Complement[]
  pieces: { id: string; type: string; depose_le: string }[]
  agence: boolean
  modifiable: boolean
}) {
  if (!demandes.length) return null
  return (
    <section className="panneau-espace mt-10">
      <h2 className="font-display text-2xl uppercase">{t.titre}</h2>
      <p className="text-muted mt-2 text-sm">{agence ? t.aideAgence : t.aideGarant}</p>
      <ul className="mt-4 space-y-4">
        {demandes.map((d) => {
          const fichiers = pieces
            .filter(
              (p) =>
                p.type === d.nature &&
                p.id !== d.piece_initiale &&
                Date.parse(p.depose_le) > Date.parse(d.attendu_depuis) &&
                !demandes.some((c) => c.piece_fournie === p.id),
            )
            .map((p) => ({
              id: p.id,
              libelle: `${natures[p.type] ?? p.type} · ${new Date(p.depose_le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`,
            }))
          return (
            <li key={d.id} className="outlined bg-sun/20 rounded-xl p-4 text-sm">
              <p className="font-bold">
                {natures[d.nature] ?? d.nature} : {t.motifs[d.motif]}
              </p>
              <p className="mt-1">{t.etats[d.etat]}</p>
              {d.piece_fournie && pieces.some((p) => p.id === d.piece_fournie) ? (
                <a
                  className="lien-espace mt-3"
                  href={
                    agence
                      ? `/espace/pieces/${d.piece_fournie}`
                      : `/garant/pieces/${d.piece_fournie}`
                  }
                >
                  {t.ouvrir}
                </a>
              ) : null}
              {modifiable && agence && d.etat === 'fourni' ? (
                <>
                  <FormulaireComplement dossierId={dossierId} cible={d.id} operation="valider" />
                  <FormulaireComplement dossierId={dossierId} cible={d.id} operation="refuser" />
                </>
              ) : null}
              {modifiable && !agence && d.etat === 'demande' ? (
                fichiers.length ? (
                  <FormulaireComplement
                    dossierId={dossierId}
                    cible={d.id}
                    operation="fournir"
                    fichiers={fichiers}
                  />
                ) : (
                  <p className="mt-2">{t.aucun}</p>
                )
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
