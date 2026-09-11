import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Capacite } from '@/lib/acces/jeton'
import { estUuidCanonique } from '@/lib/validation/uuid'
import { SEAU, inscrireAuJournal, lireCleScellee } from '@/lib/coffre/depot-supabase'
import { ouvrir } from '@/lib/coffre/enveloppe'
import { ouvrirMaitresse } from '@/lib/coffre/rotation-maitresse'
import { natureDepuis, nombreDocumentsDepuis } from './validation'

export async function lireOriginalGarant(
  db: SupabaseClient,
  capacite: Capacite,
  id: string,
  tailleMax = 20 * 1024 * 1024,
) {
  if (capacite.partie !== 'garant' || !estUuidCanonique(id)) return null
  const { data: p, error } = await db
    .from('pieces')
    .select('id,dossier_id,chemin,type,type_reel,taille_octets,nombre_documents,depose_le')
    .eq('id', id)
    .eq('dossier_id', capacite.dossierId)
    .maybeSingle()
  if (
    error ||
    !p ||
    p.dossier_id !== capacite.dossierId ||
    !Number.isSafeInteger(p.taille_octets) ||
    p.taille_octets <= 0 ||
    p.taille_octets > tailleMax
  )
    return null
  const nature = natureDepuis(p.type),
    nombre = nature ? nombreDocumentsDepuis(nature, String(p.nombre_documents ?? 1)) : null
  if (
    !nature ||
    nombre === null ||
    !['application/pdf', 'image/png', 'image/jpeg'].includes(p.type_reel)
  )
    return null
  if (!(await inscrireAuJournal(db, capacite.dossierId, 'piece_ouverte', id))) return null
  const cle = await lireCleScellee(db, capacite.dossierId)
  if (!cle) return null
  const objet = await db.storage.from(SEAU).download(p.chemin)
  if (objet.error || !objet.data || objet.data.size !== p.taille_octets + 28) return null
  const contenu = ouvrir(Buffer.from(await objet.data.arrayBuffer()), ouvrirMaitresse(cle))
  if (contenu.length !== p.taille_octets) return null
  const apres = await db
    .from('pieces')
    .select('id')
    .eq('id', id)
    .eq('dossier_id', capacite.dossierId)
    .maybeSingle()
  if (apres.error || apres.data?.id !== id) return null
  return {
    contenu,
    nature,
    nombre,
    typeReel: p.type_reel as string,
    deposeLe: p.depose_le as string,
  }
}
