import { EnteteEspace } from '@/components/ui/EnteteEspace'
import { interfaceEspace } from '@/lib/content/interface'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { contexteAgence } from '@/lib/agences/contexte'
import { collaborateurs as textes } from '@/lib/content/collaborateurs'
import { FormulaireCollaborateur } from '@/components/forms/FormulaireCollaborateur'
export const metadata: Metadata = {
  title: 'Collaborateurs',
  robots: { index: false, follow: false },
}
type Membre = {
  utilisateur_id: string
  email: string | null
  etat: 'admin' | 'membre' | 'exclu'
  admissible: boolean
}
type Trace = {
  id: number
  action: 'role' | 'exclusion' | 'readmission'
  acteur: string | null
  cible: string | null
  quand: string
}
export default async function PageCollaborateurs({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache') redirect('/connexion')
  if (contexte.role !== 'admin') notFound()
  const params = await searchParams
  const numero =
    typeof params.page === 'string' && /^[1-9]\d{0,3}$/.test(params.page) ? Number(params.page) : 1
  const [{ data, error }, { data: journal, error: erreurJournal }] = await Promise.all([
    contexte.supabase.rpc('collaborateurs_agence', { decalage: (numero - 1) * 50 }),
    contexte.supabase.rpc('journal_de_mon_agence'),
  ])
  if (error || erreurJournal) throw new Error('Administration indisponible.')
  const membres = (data ?? []) as Membre[]
  const traces = (journal ?? []) as Trace[]
  return (
    <div className="page-espace w-full max-w-[960px] self-start">
      <Link href="/espace" className="lien-espace mb-6">
        {textes.retour}
      </Link>
      <EnteteEspace titre={textes.titre} etiquette={interfaceEspace.equipe}>
        <p>{textes.aide}</p>
        <p className="mt-2 text-sm">{textes.readmission}</p>
      </EnteteEspace>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {membres.slice(0, 50).map((m) => (
          <li
            key={`${m.utilisateur_id}:${m.etat}`}
            className="outlined bg-paper shadow-brut-sm rounded-brut min-w-0 p-5"
          >
            <h2 className="font-bold break-words">{m.email ?? textes.adresseMasquee}</h2>
            <p className="mt-1 text-sm">{textes.roles[m.etat]}</p>
            <FormulaireCollaborateur
              agence={contexte.agence.id}
              cible={m.utilisateur_id}
              avant={m.etat}
              soi={m.utilisateur_id === contexte.utilisateurId}
              admissible={m.admissible}
            />
          </li>
        ))}
      </ul>
      {!membres.length ? <p className="mt-4">{textes.aucun}</p> : null}
      <nav aria-label={textes.pagination} className="mt-5 flex flex-wrap gap-4 text-sm">
        {numero > 1 ? (
          <Link href={`/espace/collaborateurs?page=${numero - 1}`} className="lien-espace mb-6">
            {textes.precedente}
          </Link>
        ) : null}
        <span>{textes.page(numero)}</span>
        {membres.length > 50 && numero < 9999 ? (
          <Link href={`/espace/collaborateurs?page=${numero + 1}`} className="underline">
            {textes.suivante}
          </Link>
        ) : null}
      </nav>
      <h2 className="font-display mt-10 text-xl uppercase">{textes.journal}</h2>
      {!traces.length ? (
        <p className="mt-3 text-sm">{textes.journalVide}</p>
      ) : (
        <ul className="mt-4 space-y-3 text-sm">
          {traces.map((e) => (
            <li key={e.id} className="border-ink/20 border-b pb-3 break-words">
              <time>{new Date(e.quand).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</time>
              {' : '}
              {textes.actions[e.action as keyof typeof textes.actions] ?? e.action}
              {' / '}
              {e.cible ?? textes.cible}
              {' / '}
              {textes.par} {e.acteur ?? textes.operateur}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
