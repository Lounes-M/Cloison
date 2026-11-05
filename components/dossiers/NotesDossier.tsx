import type { SupabaseClient } from '@supabase/supabase-js'

import { BoutonSupprimerNote, FormulaireNote } from '@/components/forms/FormulaireNote'
import { notesDossier as texte } from '@/lib/content/notes'

type Note = {
  id: string
  texte: string
  cree_le: string
  auteur_email: string | null
  supprimable: boolean
}

function lireNotes(data: unknown): Note[] | null {
  if (!Array.isArray(data)) return null
  return data.filter(
    (n): n is Note =>
      typeof n === 'object' &&
      n !== null &&
      typeof n.id === 'string' &&
      typeof n.texte === 'string' &&
      typeof n.cree_le === 'string',
  )
}

/** Les notes internes d'un dossier, lues par la 0081 ; une panne ne bloque pas la fiche. */
export async function NotesDossier({
  dossierId,
  supabase,
  modifiable,
}: {
  dossierId: string
  supabase: SupabaseClient
  modifiable: boolean
}) {
  let notes: Note[] | null = null
  try {
    const { data, error } = await supabase.rpc('notes_du_dossier', { le_dossier: dossierId })
    if (!error) notes = lireNotes(data)
  } catch {
    /* Aucun detail technique ni donnee partielle affichee. */
  }
  return (
    <section id="notes" aria-labelledby="notes-titre" className="panneau-espace mt-8">
      <h2 id="notes-titre" className="text-xl font-bold">
        {texte.titre}
      </h2>
      <p className="text-muted mt-2 text-[14px] leading-relaxed font-medium">{texte.aide}</p>
      {notes === null ? (
        <p role="status" className="mt-4 text-sm">
          {texte.indisponible}
        </p>
      ) : notes.length === 0 ? (
        <p className="mt-4 text-sm">{texte.vide}</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {notes.map((n) => {
            const date = new Date(n.cree_le).toLocaleString('fr-FR', {
              timeZone: 'Europe/Paris',
              dateStyle: 'medium',
              timeStyle: 'short',
            })
            return (
              <li key={n.id} className="border-ink/20 border-t pt-3 text-sm">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-muted break-all">
                    <strong className="text-ink">{n.auteur_email ?? texte.ancien}</strong>
                    {', '}
                    <time dateTime={n.cree_le}>{date}</time>
                  </span>
                  {n.supprimable && modifiable ? (
                    <BoutonSupprimerNote dossierId={dossierId} noteId={n.id} date={date} />
                  ) : null}
                </p>
                <p className="mt-1 break-words whitespace-pre-line">{n.texte}</p>
              </li>
            )
          })}
        </ol>
      )}
      {modifiable ? (
        <div className="mt-6">
          <FormulaireNote dossierId={dossierId} />
        </div>
      ) : null}
    </section>
  )
}
