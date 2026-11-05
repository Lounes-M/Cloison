import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SupabaseClient } from '@supabase/supabase-js'

const d = vi.hoisted(() => ({ contexte: vi.fn(), rpc: vi.fn(), revalider: vi.fn() }))
vi.mock('@/lib/agences/contexte', () => ({ contexteAgence: d.contexte }))
vi.mock('next/cache', () => ({ revalidatePath: d.revalider }))
import { ajouterNote, supprimerNote } from '@/lib/agences/action-notes'
import { NotesDossier } from '@/components/dossiers/NotesDossier'
import { notesDossier as texte } from '@/lib/content/notes'

const dossier = '11111111-1111-4111-8111-111111111111'
const note = '22222222-2222-4222-8222-222222222222'
function form(valeurs: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(valeurs)) f.set(k, v)
  return f
}
const ajouter = (valeurs: Record<string, string>) =>
  ajouterNote({ statut: 'inactif' }, form({ dossier, ...valeurs }))
const supprimer = (valeurs: Record<string, string> = {}) =>
  supprimerNote({ statut: 'inactif' }, form({ dossier, note, ...valeurs }))

beforeEach(() => {
  d.contexte.mockResolvedValue({ etat: 'rattache', supabase: { rpc: d.rpc } })
})
afterEach(() => vi.resetAllMocks())

test.each(['', '   ', 'x'.repeat(1001)])(
  'une note vide ou trop longue est refusee sans appeler la base',
  async (t) => {
    expect(await ajouter({ texte: t })).toEqual({
      statut: 'erreur',
      message: texte.erreurAjout,
      valeur: t,
    })
    expect(d.rpc).not.toHaveBeenCalled()
  },
)

test('une note est ajoutee sans espaces superflus et la fiche se rafraichit', async () => {
  d.rpc.mockResolvedValue({ data: note, error: null })
  expect(await ajouter({ texte: '  Garant joint.  ' })).toEqual({ statut: 'ajoutee' })
  expect(d.rpc).toHaveBeenCalledWith('ajouter_note_dossier', {
    le_dossier: dossier,
    le_texte: 'Garant joint.',
  })
  expect(d.revalider).toHaveBeenCalledWith(`/espace/dossiers/${dossier}`)
})

test('un refus de la base garde la saisie et ne journalise pas le texte', async () => {
  const erreur = vi.spyOn(console, 'error').mockImplementation(() => {})
  d.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
  const r = await ajouter({ texte: 'Secret' })
  expect(r).toEqual({ statut: 'erreur', message: texte.erreurAjout, valeur: 'Secret' })
  expect(erreur).toHaveBeenCalledWith('[agence] note refusee')
  expect(JSON.stringify(erreur.mock.calls)).not.toContain('Secret')
  expect(d.revalider).not.toHaveBeenCalled()
  erreur.mockRestore()
})

test('sans session rattachee, rien ne part', async () => {
  d.contexte.mockResolvedValue({ etat: 'anonyme' })
  expect(await ajouter({ texte: 'ok' })).toEqual({ statut: 'erreur', message: 'Session expirée.' })
  expect(await supprimer()).toEqual({ statut: 'erreur', message: 'Session expirée.' })
  expect(d.rpc).not.toHaveBeenCalled()
})

test('la suppression passe par la base et refuse un identifiant invalide', async () => {
  expect(await supprimer({ note: 'x' })).toEqual({
    statut: 'erreur',
    message: texte.erreurSuppression,
  })
  expect(d.rpc).not.toHaveBeenCalled()
  d.rpc.mockResolvedValue({ data: false, error: null })
  expect(await supprimer()).toEqual({ statut: 'erreur', message: texte.erreurSuppression })
  d.rpc.mockResolvedValue({ data: true, error: null })
  expect(await supprimer()).toEqual({ statut: 'supprimee' })
  expect(d.rpc).toHaveBeenCalledWith('supprimer_note_dossier', { la_note: note })
})

async function rendre(data: unknown, error: unknown = null, modifiable = true) {
  const supabase = { rpc: vi.fn().mockResolvedValue({ data, error }) }
  const html = renderToStaticMarkup(
    await NotesDossier({
      dossierId: dossier,
      supabase: supabase as unknown as SupabaseClient,
      modifiable,
    }),
  )
  return { html, supabase }
}

test('la fiche affiche les notes, leur auteur et la suppression permise', async () => {
  const { html, supabase } = await rendre([
    {
      id: note,
      texte: 'Garant joint <b>par</b> téléphone.',
      cree_le: '2026-11-05T10:00:00Z',
      auteur_email: 'alice@agence.invalid',
      supprimable: true,
    },
    {
      id: dossier,
      texte: 'Autre',
      cree_le: '2026-11-04T10:00:00Z',
      auteur_email: null,
      supprimable: false,
    },
  ])
  expect(supabase.rpc).toHaveBeenCalledWith('notes_du_dossier', { le_dossier: dossier })
  expect(html).toContain('alice@agence.invalid')
  expect(html).toContain('Garant joint &lt;b&gt;par&lt;/b&gt; téléphone.')
  expect(html).toContain(texte.ancien)
  expect(html.match(/name="note"/g)).toHaveLength(1)
  expect(html).toContain(texte.bouton)
})

test('une panne ou un dossier de demonstration ne bloquent pas la fiche', async () => {
  expect((await rendre(null, { message: 'boom' })).html).toContain(texte.indisponible)
  const vide = await rendre([], null, false)
  expect(vide.html).toContain(texte.vide)
  expect(vide.html).not.toContain(texte.bouton)
})
