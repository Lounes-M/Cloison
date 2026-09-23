import { Icone, type NomIcone } from '@/components/ui/Icone'

/** Etat de lecture sans resultat, sans suggerer une erreur ou un succes. */
export function EtatVide({
  titre,
  children,
  icone = 'fichier',
}: {
  titre: string
  children?: React.ReactNode
  icone?: NomIcone
}) {
  return (
    <div className="panneau-espace flex flex-col items-start gap-5 sm:flex-row sm:items-center">
      <span className="bg-sky/20 text-cobalt grid size-14 shrink-0 place-items-center rounded-2xl">
        <Icone nom={icone} className="size-6" />
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-balance">{titre}</h2>
        {children ? (
          <div className="text-muted mt-2 max-w-xl text-sm leading-relaxed">{children}</div>
        ) : null}
      </div>
    </div>
  )
}
