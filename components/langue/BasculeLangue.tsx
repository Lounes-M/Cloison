import { changerLangue } from '@/lib/action-langue'
import { LANGUES, type Langue } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Le nom de chaque langue dans sa propre langue, pour les lecteurs d'ecran. */
const NOMS: Record<Langue, string> = { fr: 'Français', en: 'English' }

/**
 * La bascule de langue d'un espace connecte : un formulaire, donc elle
 * fonctionne sans JavaScript, et l'action enregistre aussi la langue des
 * courriels.
 */
export function BasculeLangue({ langue, libelle }: { langue: Langue; libelle: string }) {
  return (
    <form action={changerLangue} role="group" aria-label={libelle} className="bascule-langue">
      {LANGUES.map((code) => (
        <button
          key={code}
          type="submit"
          name="langue"
          value={code}
          lang={code}
          aria-pressed={code === langue}
          className={cn('bascule-langue-choix', code === langue && 'bascule-langue-actif')}
        >
          {code}
          <span className="sr-only">, {NOMS[code]}</span>
        </button>
      ))}
    </form>
  )
}
