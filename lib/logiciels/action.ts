'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { contexteAgence } from '@/lib/agences/contexte'
import { logiciels as texteFr } from '@/lib/content/logiciels'
import { logiciels as texteEn } from '@/lib/content/en/logiciels'
import { choisir } from '@/lib/i18n'
import { langueEspace } from '@/lib/langue-espace'
import { apimoConfigure, lireLocationsApimo } from './apimo'

/**
 * Import des biens a louer depuis le logiciel de l'agence (migration 0089).
 *
 * L'administrateur enregistre l'identifiant de son agence chez l'editeur, puis
 * lance l'import. Les droits, la cadence et l'inscription sont tenus en base ;
 * ces actions ne font que lire l'editeur entre deux appels.
 */

export type EtatLogiciel =
  | { statut: 'inactif' }
  | { statut: 'enregistre' }
  | { statut: 'importe'; crees: number; misAJour: number }
  | { statut: 'erreur'; message: string }

const compte = z.object({ crees: z.number().int().min(0), mis_a_jour: z.number().int().min(0) })

export async function reglerApimo(_p: EtatLogiciel, donnees: FormData): Promise<EtatLogiciel> {
  const texte = choisir(await langueEspace(), texteFr, texteEn)
  const identifiant = String(donnees.get('identifiant') ?? '').trim()
  if (identifiant !== '' && !/^[0-9]{1,10}$/.test(identifiant)) {
    return { statut: 'erreur', message: texte.erreurs.identifiant }
  }
  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache' || contexte.role !== 'admin' || !apimoConfigure()) {
    return { statut: 'erreur', message: texte.erreurs.session }
  }
  const { data, error } = await contexte.supabase.rpc('regler_connexion_logiciel', {
    le_logiciel: 'apimo',
    l_identifiant: identifiant,
  })
  if (error || data !== true) {
    if (error) console.error('[agence] connexion au logiciel non reglee')
    return { statut: 'erreur', message: texte.erreurs.general }
  }
  revalidatePath('/espace/connecteurs')
  return { statut: 'enregistre' }
}

export async function importerDepuisApimo(
  _p: EtatLogiciel,
  _donnees: FormData,
): Promise<EtatLogiciel> {
  const texte = choisir(await langueEspace(), texteFr, texteEn)
  const contexte = await contexteAgence()
  if (contexte.etat !== 'rattache' || contexte.role !== 'admin' || !apimoConfigure()) {
    return { statut: 'erreur', message: texte.erreurs.session }
  }
  const { data: identifiant, error: reservation } = await contexte.supabase.rpc(
    'reserver_import_logiciel',
    { le_logiciel: 'apimo' },
  )
  if (reservation) {
    console.error('[agence] import non reserve')
    return { statut: 'erreur', message: texte.erreurs.general }
  }
  if (typeof identifiant !== 'string') return { statut: 'erreur', message: texte.erreurs.cadence }

  const lecture = await lireLocationsApimo(identifiant)
  if (lecture.etat !== 'ok') {
    console.error('[agence] lecture du logiciel en echec')
    return { statut: 'erreur', message: texte.erreurs.lecture[lecture.etat] }
  }
  if (lecture.biens.length === 0) return { statut: 'erreur', message: texte.erreurs.aucun }

  const { data, error } = await contexte.supabase.rpc('importer_logements', {
    le_logiciel: 'apimo',
    biens: lecture.biens,
  })
  const resultat = compte.safeParse(data)
  if (error || !resultat.success) {
    if (error) console.error('[agence] import des logements refuse')
    return { statut: 'erreur', message: texte.erreurs.general }
  }
  revalidatePath('/espace/logements')
  revalidatePath('/espace/connecteurs')
  return { statut: 'importe', crees: resultat.data.crees, misAJour: resultat.data.mis_a_jour }
}
